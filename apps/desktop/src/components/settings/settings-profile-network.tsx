import type { ConfigProfile, McpTransportKind, TlsMode, VpnMode } from '@worklens/contracts';
import { Input } from '../ui/input';
import { PreferenceRow, SettingsSection, Switch } from './settings-common';

export function SettingsProfileNetwork({
  current,
  onUpdateDraft,
}: {
  current: ConfigProfile;
  onUpdateDraft: <K extends keyof ConfigProfile>(key: K, val: ConfigProfile[K]) => void;
}) {
  return (
    <>
      <SettingsSection
        title="TLS & Cryptographic Security"
        description="Certificates, strict mTLS and pinned public keys"
      >
        <PreferenceRow title="TLS Mode" description="Enforce cryptographic encryption for remote transports.">
          <select
            className="preference-select"
            value={current.network.tls.mode}
            onChange={(e) => {
              const mode = e.target.value as TlsMode;
              onUpdateDraft('network', { ...current.network, tls: { ...current.network.tls, mode } });
            }}
          >
            <option value="disabled">Disabled</option>
            <option value="optional">Optional TLS</option>
            <option value="required">Require TLS</option>
            <option value="mutual_tls">Strict mTLS</option>
          </select>
        </PreferenceRow>
        <PreferenceRow title="Minimum TLS Version" description="Enforce modern cryptographic suites.">
          <select
            className="preference-select"
            value={current.network.tls.minVersion}
            onChange={(e) =>
              onUpdateDraft('network', {
                ...current.network,
                tls: { ...current.network.tls, minVersion: e.target.value },
              })
            }
          >
            <option value="1.3">TLS 1.3 (Recommended)</option>
            <option value="1.2">TLS 1.2</option>
          </select>
        </PreferenceRow>
        <PreferenceRow
          title="CA Certificate Path"
          description="Custom root certificate authority file (.pem/.crt)."
        >
          <Input
            className="w-80"
            placeholder="/etc/ssl/certs/worklens-ca.crt"
            value={current.network.tls.caCertPath ?? ''}
            onChange={(e) =>
              onUpdateDraft('network', {
                ...current.network,
                tls: { ...current.network.tls, caCertPath: e.target.value || null },
              })
            }
          />
        </PreferenceRow>
        <PreferenceRow
          title="Client Certificate & Key"
          description="Required when Mutual TLS (mTLS) is enabled."
        >
          <div className="flex gap-2">
            <Input
              className="w-40"
              placeholder="client.crt"
              value={current.network.tls.clientCertPath ?? ''}
              onChange={(e) =>
                onUpdateDraft('network', {
                  ...current.network,
                  tls: { ...current.network.tls, clientCertPath: e.target.value || null },
                })
              }
            />
            <Input
              className="w-40"
              placeholder="client.key"
              value={current.network.tls.clientKeyPath ?? ''}
              onChange={(e) =>
                onUpdateDraft('network', {
                  ...current.network,
                  tls: { ...current.network.tls, clientKeyPath: e.target.value || null },
                })
              }
            />
          </div>
        </PreferenceRow>
        <PreferenceRow
          title="Pinned Fingerprints (SHA-256)"
          description="Comma-separated hashes to prevent MITM attacks."
        >
          <Input
            className="w-80 font-mono text-[11px]"
            placeholder="a1b2c3d4..., e5f6a7b8..."
            value={current.network.tls.pinnedFingerprints.join(', ')}
            onChange={(e) => {
              const arr = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              onUpdateDraft('network', {
                ...current.network,
                tls: { ...current.network.tls, pinnedFingerprints: arr },
              });
            }}
          />
        </PreferenceRow>
      </SettingsSection>

      <SettingsSection
        title="Proxy & Tunneling Network"
        description="Corporate HTTP/SOCKS5 proxy and VPN encapsulation"
      >
        <PreferenceRow
          title="Enable Proxy"
          description="Route outbound tool and API traffic through a forward proxy."
        >
          <Switch
            label="Enable Proxy"
            checked={current.network.proxy.enabled}
            onChange={(enabled) =>
              onUpdateDraft('network', { ...current.network, proxy: { ...current.network.proxy, enabled } })
            }
          />
        </PreferenceRow>
        {current.network.proxy.enabled && (
          <>
            <PreferenceRow title="Proxy URL" description="HTTP, HTTPS or SOCKS5 proxy endpoint.">
              <Input
                className="w-80 font-mono text-xs"
                placeholder="http://proxy.internal:8080 or socks5://127.0.0.1:1080"
                value={current.network.proxy.url ?? ''}
                onChange={(e) =>
                  onUpdateDraft('network', {
                    ...current.network,
                    proxy: { ...current.network.proxy, url: e.target.value || null },
                  })
                }
              />
            </PreferenceRow>
            <PreferenceRow
              title="Keychain Credential Key"
              description="Identifier for proxy credentials stored in the OS Keychain."
            >
              <Input
                className="w-64"
                placeholder="worklens.proxy.auth"
                value={current.network.proxy.authKeychainKey ?? ''}
                onChange={(e) =>
                  onUpdateDraft('network', {
                    ...current.network,
                    proxy: { ...current.network.proxy, authKeychainKey: e.target.value || null },
                  })
                }
              />
            </PreferenceRow>
          </>
        )}
        <PreferenceRow title="VPN / Tunnel Routing" description="Select tunnel encapsulation protocol.">
          <select
            className="preference-select"
            value={current.network.vpn.mode}
            onChange={(e) => {
              const mode = e.target.value as VpnMode;
              onUpdateDraft('network', {
                ...current.network,
                vpn: { ...current.network.vpn, mode, enabled: mode !== 'none' },
              });
            }}
          >
            <option value="none">None (Direct)</option>
            <option value="wire_guard">WireGuard</option>
            <option value="tailscale">Tailscale</option>
            <option value="custom_tunnel">Custom Tunnel</option>
          </select>
        </PreferenceRow>
      </SettingsSection>

      <SettingsSection
        title="Profile Transport Toggles"
        description="Control active endpoints initialized by this profile"
      >
        <PreferenceRow
          title="Unix Domain Socket"
          description="Local fast inter-process socket (`service.sock`)."
        >
          <Switch
            label="Domain Socket"
            checked={current.transports.sockEnabled}
            onChange={(sockEnabled) => onUpdateDraft('transports', { ...current.transports, sockEnabled })}
          />
        </PreferenceRow>
        <PreferenceRow
          title="Named Pipe"
          description="Windows / local fallback named pipe (`named_pipe/worklens`)."
        >
          <Switch
            label="Named Pipe"
            checked={current.transports.pipeEnabled}
            onChange={(pipeEnabled) => onUpdateDraft('transports', { ...current.transports, pipeEnabled })}
          />
        </PreferenceRow>
        <PreferenceRow
          title="HTTP & SSE API Server"
          description="Embedded REST API & Server-Sent Events server for web clients."
        >
          <div className="flex items-center gap-3">
            <Switch
              label="HTTP API"
              checked={current.transports.apiEnabled}
              onChange={(apiEnabled) => onUpdateDraft('transports', { ...current.transports, apiEnabled })}
            />
            {current.transports.apiEnabled && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Input
                  className="w-28 text-xs font-mono"
                  value={current.transports.apiBind}
                  onChange={(e) =>
                    onUpdateDraft('transports', { ...current.transports, apiBind: e.target.value })
                  }
                />
                <span>:</span>
                <Input
                  className="w-16 text-xs font-mono"
                  type="number"
                  value={current.transports.apiPort}
                  onChange={(e) =>
                    onUpdateDraft('transports', {
                      ...current.transports,
                      apiPort: Number(e.target.value) || 4040,
                    })
                  }
                />
              </div>
            )}
          </div>
        </PreferenceRow>
        <PreferenceRow
          title="Model Context Protocol (MCP)"
          description="AI assistant agent context server via stdio or SSE."
        >
          <div className="flex items-center gap-3">
            <Switch
              label="MCP Enabled"
              checked={current.transports.mcpEnabled}
              onChange={(mcpEnabled) => onUpdateDraft('transports', { ...current.transports, mcpEnabled })}
            />
            {current.transports.mcpEnabled && (
              <select
                className="preference-select"
                value={current.transports.mcpTransport}
                onChange={(e) =>
                  onUpdateDraft('transports', {
                    ...current.transports,
                    mcpTransport: e.target.value as McpTransportKind,
                  })
                }
              >
                <option value="stdio">Stdio (Standard I/O)</option>
                <option value="sse_http">SSE over HTTP</option>
                <option value="socket">Domain Socket</option>
              </select>
            )}
          </div>
        </PreferenceRow>
      </SettingsSection>
    </>
  );
}
