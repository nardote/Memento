'use client';

import { FormEvent, useMemo, useState } from 'react';

type NodeKey = 'a' | 'b';
type NodeConfig = { name: string; url: string; token: string; status: 'unknown' | 'online' | 'offline' };
type Json = Record<string, unknown>;

const initialNodes: Record<NodeKey, NodeConfig> = {
  a: { name: 'Memento A', url: 'http://127.0.0.1:8781', token: '', status: 'unknown' },
  b: { name: 'Memento B', url: 'http://127.0.0.1:8782', token: '', status: 'unknown' },
};

function pretty(value: unknown) { return JSON.stringify(value, null, 2); }

export default function Home() {
  const [nodes, setNodes] = useState(initialNodes);
  const [selected, setSelected] = useState<NodeKey>('a');
  const [project, setProject] = useState('equipo');
  const [action, setAction] = useState('');
  const [details, setDetails] = useState('');
  const [tags, setTags] = useState('');
  const [output, setOutput] = useState<Json | Json[] | string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = nodes[selected];
  const hasToken = useMemo(() => active.token.trim().length > 0, [active.token]);

  function updateNode(key: NodeKey, changes: Partial<NodeConfig>) { setNodes((current) => ({ ...current, [key]: { ...current[key], ...changes } })); }

  async function health(key: NodeKey) {
    const node = nodes[key];
    try {
      const response = await fetch(`${node.url.replace(/\/$/, '')}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      updateNode(key, { status: 'online' });
    } catch { updateNode(key, { status: 'offline' }); }
  }

  async function call(tool: string, args: Json = {}) {
    if (!active.token.trim()) { setOutput('Ingresá el token de este nodo antes de ejecutar una acción.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${active.url.replace(/\/$/, '')}/mcp`, {
        method: 'POST', headers: { Authorization: `Bearer ${active.token.trim()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: tool, arguments: args } }),
      });
      const payload = await response.json() as { error?: { message?: string }; result?: { content?: Array<{ text?: string }> } };
      if (!response.ok || payload.error) throw new Error(payload.error?.message || `HTTP ${response.status}`);
      const text = payload.result?.content?.[0]?.text ?? '{}';
      try { setOutput(JSON.parse(text)); } catch { setOutput(text); }
      updateNode(selected, { status: 'online' });
    } catch (error) {
      updateNode(selected, { status: 'offline' });
      setOutput(`No se pudo comunicar con ${active.name}: ${error instanceof Error ? error.message : 'error desconocido'}`);
    } finally { setBusy(false); }
  }

  async function addActivity(event: FormEvent) {
    event.preventDefault();
    await call('activity_add', { project, action, details, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) });
    setAction(''); setDetails(''); setTags('');
  }

  return <main>
    <header className="topbar"><div><p className="eyebrow">Control local</p><h1>Memento Console</h1></div><p className="session-note">Los tokens viven sólo en esta pestaña.</p></header>
    <section className="node-grid" aria-label="Nodos Memento">
      {(Object.keys(nodes) as NodeKey[]).map((key) => { const node = nodes[key]; return <button className={`node-card ${selected === key ? 'selected' : ''}`} key={key} onClick={() => setSelected(key)}><span className={`dot ${node.status}`} /><span><strong>{node.name}</strong><small>{node.url}</small></span><span className="token-state">{node.token ? 'token cargado' : 'sin token'}</span></button>; })}
    </section>
    <section className="workspace">
      <aside className="settings panel"><p className="eyebrow">Conexión activa</p><h2>{active.name}</h2>
        <label>URL MCP<input value={active.url} onChange={(event) => updateNode(selected, { url: event.target.value })} spellCheck="false" /></label>
        <label>Token<input type="password" value={active.token} onChange={(event) => updateNode(selected, { token: event.target.value })} placeholder="Pegá el token de este nodo" autoComplete="off" /></label>
        <button className="secondary" onClick={() => health(selected)}>Comprobar conexión</button><button className="ghost" onClick={() => updateNode(selected, { token: '' })}>Olvidar token</button>
        <p className="hint">Para Docker: cargá <code>a-admin.token</code> en A y <code>b-admin.token</code> en B.</p>
      </aside>
      <section className="actions">
        <div className="panel quick-actions"><div className="section-title"><div><p className="eyebrow">Operaciones</p><h2>Consultar y sincronizar</h2></div><span className={hasToken ? 'ready' : 'not-ready'}>{hasToken ? 'Autenticado' : 'Falta token'}</span></div>
          <label>Proyecto<input value={project} onChange={(event) => setProject(event.target.value)} placeholder="equipo" /></label>
          <div className="button-grid"><button disabled={busy} onClick={() => call('activity_list', { project, limit: 20 })}>Ver actividades</button><button disabled={busy} onClick={() => call('task_list', { project })}>Ver tareas</button><button disabled={busy} onClick={() => call('inbox_list', {})}>Ver inbox</button><button disabled={busy} onClick={() => call('peer_list', {})}>Ver peers</button><button disabled={busy} onClick={() => call('peer_sync', {})}>Sincronizar ahora</button><button disabled={busy} onClick={() => call('task_run_due', {})}>Evaluar triggers</button></div>
        </div>
        <form className="panel activity-form" onSubmit={addActivity}><div className="section-title"><div><p className="eyebrow">Nueva actividad</p><h2>Registrar información</h2></div></div>
          <label>Acción<input required value={action} onChange={(event) => setAction(event.target.value)} placeholder="Ej.: Hallazgo confirmado" /></label><label>Detalle<textarea required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Qué cambió, evidencia y próximo paso" rows={4} /></label><label>Tags separados por coma<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="topic:refunds, ticket:SKY-123" /></label><button disabled={busy} type="submit">{busy ? 'Enviando…' : 'Guardar actividad'}</button>
        </form>
        <div className="panel approval"><p className="eyebrow">Seguridad</p><h2>Aprobar una tarea recibida</h2><p>Consultá las tareas de B y aprobá sólo en el nodo ejecutor.</p><TaskApproval onApprove={(taskId) => call('task_approve', { task_id: taskId })} disabled={busy} /></div>
      </section>
      <aside className="panel output-panel" aria-live="polite"><p className="eyebrow">Respuesta</p><h2>{busy ? 'Procesando…' : 'Último resultado'}</h2><pre>{output === null ? 'Elegí una operación para ver el resultado.' : typeof output === 'string' ? output : pretty(output)}</pre></aside>
    </section>
  </main>;
}

function TaskApproval({ onApprove, disabled }: { onApprove: (taskId: string) => Promise<void>; disabled: boolean }) {
  const [taskId, setTaskId] = useState('');
  return <form className="inline-form" onSubmit={async (event) => { event.preventDefault(); await onApprove(taskId); setTaskId(''); }}><input required value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="task_…" spellCheck="false" /><button disabled={disabled} type="submit">Aprobar</button></form>;
}
