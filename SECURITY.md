# Security boundaries

Worklens reads local repository data and optional GitHub data. It does not provide an isolation boundary against other processes running under the same macOS user. Repository trust authorizes execution of local Nx plugins; do not trust hostile repositories. No token is exposed to the frontend, MCP, SQLite or context exports.

Do not paste secrets or private repository data in public issues. For suspected credential disclosure or filesystem escape, use the repository's private vulnerability reporting facility if enabled; otherwise contact a maintainer privately before sharing details. This alpha has not undergone an independent security audit and is not intended as a hardened multi-user service.

GitHub workflow permissions are read-only. Contributions do not receive app credentials or signing secrets. The local alpha is not Developer ID signed or notarized.
