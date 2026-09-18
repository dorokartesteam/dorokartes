import { PageIntro, Panel, Status } from "@/components/admin/AdminUI";

function envState(name:string) { return process.env[name] ? "CONFIGURED" : "MISSING"; }

export default function SettingsPage() {
  const vars = ["DATABASE_URL","ADMIN_USER","ADMIN_PASSWORD","OPENAI_API_KEY"];
  return <>
    <PageIntro title="Settings" text="Runtime health and operational configuration. Secret values are never rendered." />
    <div className="dk-grid2">
      <Panel title="Environment" subtitle="Presence check only">{vars.map(v=><div className="dk-settingrow" key={v}><div><b>{v}</b><small>Secret value hidden</small></div><Status value={envState(v)}/></div>)}</Panel>
      <Panel title="Admin security" subtitle="Current deployment assumptions"><ul className="dk-checklist"><li>/admin/* protected by Basic Auth proxy</li><li>/api/admin/* protected by the same proxy</li><li>Production fails closed when admin credentials are missing</li><li>Offline pipeline scripts excluded from production typecheck/runtime</li></ul></Panel>
    </div>
  </>;
}
