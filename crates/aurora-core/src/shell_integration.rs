#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellType {
    Zsh,
    Bash,
    Fish,
}

impl ShellType {
    pub fn from_shell_name(name: &str) -> Option<Self> {
        if name.contains("zsh") {
            Some(Self::Zsh)
        } else if name.contains("bash") {
            Some(Self::Bash)
        } else if name.contains("fish") {
            Some(Self::Fish)
        } else {
            None
        }
    }

    pub fn script(&self) -> &'static str {
        match self {
            Self::Zsh => ZSH_INTEGRATION_SCRIPT,
            Self::Bash => BASH_INTEGRATION_SCRIPT,
            Self::Fish => FISH_INTEGRATION_SCRIPT,
        }
    }
}

pub const ZSH_INTEGRATION_SCRIPT: &str = r#"
# AuroraTerm Shell Integration for Zsh (OSC 7 / OSC 133)
if [[ -z "$AURORA_SHELL_INTEGRATION" ]]; then
  export AURORA_SHELL_INTEGRATION=1

  aurora_osc7() {
    printf '\e]7;file://%s%s\e\\' "$HOST" "$PWD"
  }

  aurora_precmd() {
    local ret=$?
    # OSC 133 D (Command finished with return code)
    printf '\e]133;D;%d\e\\' "$ret"
    # OSC 7 (Current Working Directory)
    aurora_osc7
    # OSC 133 A (Fresh prompt starts)
    printf '\e]133;A\e\\'
  }

  aurora_preexec() {
    # OSC 133 C (Command execution starts)
    printf '\e]133;C\e\\'
  }

  autoload -Uz add-zsh-hook
  add-zsh-hook precmd aurora_precmd
  add-zsh-hook preexec aurora_preexec
fi
"#;

pub const BASH_INTEGRATION_SCRIPT: &str = r#"
# AuroraTerm Shell Integration for Bash (OSC 7 / OSC 133)
if [ -z "$AURORA_SHELL_INTEGRATION" ]; then
  export AURORA_SHELL_INTEGRATION=1

  aurora_prompt() {
    local ret=$?
    printf '\e]133;D;%d\e\\' "$ret"
    printf '\e]7;file://%s%s\e\\' "$HOSTNAME" "$PWD"
    printf '\e]133;A\e\\'
  }

  PROMPT_COMMAND="aurora_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
  trap 'printf "\e]133;C\e\\"' DEBUG
fi
"#;

pub const FISH_INTEGRATION_SCRIPT: &str = r#"
# AuroraTerm Shell Integration for Fish (OSC 7 / OSC 133)
if not set -q AURORA_SHELL_INTEGRATION
  set -g AURORA_SHELL_INTEGRATION 1

  function __aurora_precmd --on-event fish_prompt
    set -l last_status $status
    printf '\e]133;D;%d\e\\' $last_status
    printf '\e]7;file://%s%s\e\\' (hostname) (pwd)
    printf '\e]133;A\e\\'
  end

  function __aurora_preexec --on-event fish_preexec
    printf '\e]133;C\e\\'
  end
end
"#;
