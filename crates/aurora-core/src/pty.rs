use crate::error::{AuroraError, Result};
use std::ffi::CString;
use std::os::fd::RawFd;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PtySize {
    pub rows: u16,
    pub cols: u16,
    pub pixel_width: u16,
    pub pixel_height: u16,
}

impl Default for PtySize {
    fn default() -> Self {
        Self {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

pub struct NativePty {
    master_fd: RawFd,
    child_pid: libc::pid_t,
    size: PtySize,
    is_alive: Arc<AtomicBool>,
}

impl NativePty {
    pub fn spawn(
        shell: Option<&str>,
        args: &[&str],
        working_dir: Option<&str>,
        size: PtySize,
        extra_env: &[(&str, &str)],
    ) -> Result<Self> {
        let mut master: RawFd = -1;
        let mut slave: RawFd = -1;

        let mut win = libc::winsize {
            ws_row: size.rows,
            ws_col: size.cols,
            ws_xpixel: size.pixel_width,
            ws_ypixel: size.pixel_height,
        };

        let res = unsafe { libc::openpty(&mut master, &mut slave, std::ptr::null_mut(), std::ptr::null_mut(), &mut win) };
        if res < 0 {
            return Err(AuroraError::PtyAllocation(
                std::io::Error::last_os_error().to_string(),
            ));
        }

        let default_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let target_shell = shell.unwrap_or(&default_shell);

        let pid = unsafe { libc::fork() };
        if pid < 0 {
            unsafe {
                libc::close(master);
                libc::close(slave);
            }
            return Err(AuroraError::PtyAllocation("Fork failed".to_string()));
        }

        if pid == 0 {
            // Child process execution
            unsafe {
                libc::close(master);
                libc::setsid();

                #[cfg(any(target_os = "macos", target_os = "ios"))]
                libc::ioctl(slave, libc::TIOCSCTTY as libc::c_ulong, 0);

                libc::dup2(slave, libc::STDIN_FILENO);
                libc::dup2(slave, libc::STDOUT_FILENO);
                libc::dup2(slave, libc::STDERR_FILENO);

                if slave > libc::STDERR_FILENO {
                    libc::close(slave);
                }

                if let Some(dir) = working_dir {
                    if let Ok(c_dir) = CString::new(dir) {
                        libc::chdir(c_dir.as_ptr());
                    }
                }

                std::env::set_var("TERM", "xterm-256color");
                std::env::set_var("COLORTERM", "truecolor");
                std::env::set_var("AURORA_TERM", "1");

                for (key, val) in extra_env {
                    std::env::set_var(key, val);
                }

                let c_shell = CString::new(target_shell).unwrap();
                let mut c_args: Vec<CString> = vec![c_shell.clone()];
                for arg in args {
                    if let Ok(c_arg) = CString::new(*arg) {
                        c_args.push(c_arg);
                    }
                }
                let mut argv: Vec<*const libc::c_char> = c_args.iter().map(|s| s.as_ptr()).collect();
                argv.push(std::ptr::null());

                libc::execvp(c_shell.as_ptr(), argv.as_ptr());
                libc::_exit(127);
            }
        }

        // Parent process
        unsafe {
            libc::close(slave);
            // Set master non-blocking
            let flags = libc::fcntl(master, libc::F_GETFL, 0);
            libc::fcntl(master, libc::F_SETFL, flags | libc::O_NONBLOCK);
        }

        Ok(Self {
            master_fd: master,
            child_pid: pid,
            size,
            is_alive: Arc::new(AtomicBool::new(true)),
        })
    }

    pub fn resize(&mut self, new_size: PtySize) -> Result<()> {
        let win = libc::winsize {
            ws_row: new_size.rows,
            ws_col: new_size.cols,
            ws_xpixel: new_size.pixel_width,
            ws_ypixel: new_size.pixel_height,
        };
        let res = unsafe { libc::ioctl(self.master_fd, libc::TIOCSWINSZ, &win) };
        if res < 0 {
            return Err(AuroraError::PtyIo(std::io::Error::last_os_error()));
        }
        self.size = new_size;
        Ok(())
    }

    pub fn write_all(&self, data: &[u8]) -> Result<usize> {
        let mut total = 0;
        while total < data.len() {
            let written = unsafe {
                libc::write(
                    self.master_fd,
                    data[total..].as_ptr() as *const libc::c_void,
                    data.len() - total,
                )
            };
            if written < 0 {
                let err = std::io::Error::last_os_error();
                if err.kind() == std::io::ErrorKind::WouldBlock {
                    continue;
                }
                return Err(AuroraError::PtyIo(err));
            }
            total += written as usize;
        }
        Ok(total)
    }

    pub fn read(&self, buf: &mut [u8]) -> Result<usize> {
        let n = unsafe {
            libc::read(
                self.master_fd,
                buf.as_mut_ptr() as *mut libc::c_void,
                buf.len(),
            )
        };
        if n < 0 {
            let err = std::io::Error::last_os_error();
            if err.kind() == std::io::ErrorKind::WouldBlock {
                return Ok(0);
            }
            return Err(AuroraError::PtyIo(err));
        }
        if n == 0 {
            self.is_alive.store(false, Ordering::SeqCst);
        }
        Ok(n as usize)
    }

    pub fn child_pid(&self) -> libc::pid_t {
        self.child_pid
    }

    pub fn master_raw_fd(&self) -> RawFd {
        self.master_fd
    }

    pub fn is_alive(&self) -> bool {
        self.is_alive.load(Ordering::SeqCst)
    }
}

impl Drop for NativePty {
    fn drop(&mut self) {
        unsafe {
            if self.master_fd >= 0 {
                libc::close(self.master_fd);
            }
            if self.child_pid > 0 {
                libc::kill(self.child_pid, libc::SIGHUP);
                let mut status = 0;
                libc::waitpid(self.child_pid, &mut status, libc::WNOHANG);
            }
        }
    }
}
