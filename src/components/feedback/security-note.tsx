import { DatabaseZap, KeyRound, MonitorSmartphone } from "lucide-react";

export function SecurityNote() {
  return (
    <aside className="auth-note">
      <p className="eyebrow" style={{ color: "#77d4c1" }}>
        Local security
      </p>
      <h2 style={{ margin: "0", fontSize: 23, letterSpacing: "-0.025em" }}>
        Your credentials stay encrypted outside the browser.
      </h2>
      <ul className="security-list">
        <li>
          <KeyRound size={19} />
          <span>
            Personal Access Tokens are encrypted independently with AES-256-GCM.
          </span>
        </li>
        <li>
          <DatabaseZap size={19} />
          <span>
            Neon stores encrypted token envelopes and non-secret cached
            metadata; connection details remain server-only.
          </span>
        </li>
        <li>
          <MonitorSmartphone size={19} />
          <span>
            Harbor binds to 127.0.0.1 and is not available to devices on your
            LAN.
          </span>
        </li>
      </ul>
      <p
        style={{
          margin: "34px 0 0",
          color: "#7f929e",
          fontSize: 11,
          lineHeight: 1.6,
        }}
      >
        Supabase Harbor is an unofficial personal tool and is not affiliated
        with or endorsed by Supabase.
      </p>
    </aside>
  );
}
