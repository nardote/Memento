'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type NodeKey = 'a' | 'b';
type NodeConfig = { name: string; url: string; token: string; status: 'unknown' | 'online' | 'offline' };
type Task = { task_id: string; spec: { creator: string; executor: string; project: string; action: { title?: string; message?: string; request_kind?: string } }; approved?: boolean };
type Event = { event_id: string; title: string; content: string; tags: string[]; occurred_at: string; actor?: string };
type RemoteItem = { id?: string; title?: string; content?: string; type?: string; created_at?: string; author?: string };

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
  const [output, setOutput] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [replyTaskId, setReplyTaskId] = useState('');
  const [replyDetails, setReplyDetails] = useState('');
  const [requests, setRequests] = useState<Task[]>([]);
  const [responses, setResponses] = useState<Event[]>([]);
  const [remoteQuery, setRemoteQuery] = useState('');
  const [remoteItems, setRemoteItems] = useState<RemoteItem[]>([]);
  const active = nodes[selected];
  const hasToken = useMemo(() => active.token.trim().length > 0, [active.token]);

  useEffect(() => {
    fetch('/api/bootstrap', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ a?: string; b?: string }> : {})
      .then((tokens) => setNodes((current) => ({
        a: { ...current.a, token: current.a.token || tokens.a || '' },
        b: { ...current.b, token: current.b.token || tokens.b || '' },
      })))
      .catch(() => undefined);
  }, []);

  function updateNode(key: NodeKey, changes: Partial<NodeConfig>) { setNodes((current) => ({ ...current, [key]: { ...current[key], ...changes } })); }

  async function health(key: NodeKey) {
    const node = nodes[key];
    try {
      const response = await fetch(`${node.url.replace(/\/$/, '')}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      updateNode(key, { status: 'online' });
    } catch { updateNode(key, { status: 'offline' }); }
  }

  async function call(tool: string, args: Record<string, unknown> = {}) {
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
      let result: unknown = text;
      try { result = JSON.parse(text); } catch { /* La respuesta puede ser texto. */ }
      setOutput(result);
      updateNode(selected, { status: 'online' });
      return result;
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

  const targetNode = selected === 'a' ? 'memento-b' : 'memento-a';

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    const result = await call('task_create', {
      executor: targetNode,
      project,
      trigger: { type: 'at', at: new Date().toISOString() },
      action: { type: 'notify', title: `Solicitud de información de ${active.name}`, message: requestMessage, request_kind: 'information' },
      catch_up: 'execute',
    }) as Task | undefined;
    if (result?.task_id) setReplyTaskId(result.task_id);
    setRequestMessage('');
  }

  async function loadRequests() {
    const result = await call('task_list', { project });
    if (Array.isArray(result)) setRequests(result.filter((task): task is Task => typeof task === 'object' && task !== null && (task as Task).spec?.action?.request_kind === 'information'));
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    await call('activity_add', { project, action: `Respuesta a ${replyTaskId.slice(0, 18)}…`, details: replyDetails, tags: [`request:${replyTaskId}`, 'kind:request-response'] });
    setReplyDetails('');
  }

  async function loadResponses() {
    const result = await call('event_list', { project });
    if (Array.isArray(result)) setResponses(result.filter((item): item is Event => typeof item === 'object' && item !== null && Array.isArray((item as Event).tags) && (item as Event).tags.some((tag) => tag.startsWith('request:'))));
  }

  async function searchRemote(event: FormEvent) {
    event.preventDefault();
    const result = await call('peer_search', { peer: targetNode, project, query: remoteQuery, limit: 20 }) as { items?: unknown } | undefined;
    if (Array.isArray(result?.items)) setRemoteItems(result.items.filter((item): item is RemoteItem => typeof item === 'object' && item !== null));
  }

  return <main>
    <header className="topbar"><div><p className="eyebrow">Control local</p><h1>Memento Console</h1></div><p className="session-note">En Docker, los tokens se cargan desde secretos locales y no se guardan en el navegador.</p></header>
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
        <section className="panel remote-search"><div className="section-title"><div><p className="eyebrow">Búsqueda directa</p><h2>Buscar en {targetNode}</h2></div></div><p>Consulta lo que el otro nodo ya tiene guardado. No crea tareas, no sincroniza ni copia la información.</p><form className="inline-form" onSubmit={searchRemote}><input required value={remoteQuery} onChange={(event) => setRemoteQuery(event.target.value)} placeholder="Ej.: refunds, diagnóstico, SKY-123" /><button disabled={busy} type="submit">Buscar</button></form><div className="conversation-actions">{remoteItems.map((item, index) => <article className="message-card" key={item.id || `${item.title}-${index}`}><strong>{item.title || 'Sin título'}</strong><p>{item.content || 'Sin contenido'}</p><small>{item.type || 'memoria'} · {item.author || 'autor no disponible'} · {item.created_at || ''}</small></article>)}</div></section>
        <form className="panel activity-form" onSubmit={addActivity}><div className="section-title"><div><p className="eyebrow">Nueva actividad</p><h2>Registrar información</h2></div></div>
          <label>Acción<input required value={action} onChange={(event) => setAction(event.target.value)} placeholder="Ej.: Hallazgo confirmado" /></label><label>Detalle<textarea required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Qué cambió, evidencia y próximo paso" rows={4} /></label><label>Tags separados por coma<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="topic:refunds, ticket:SKY-123" /></label><button disabled={busy} type="submit">{busy ? 'Enviando…' : 'Guardar actividad'}</button>
        </form>
        <section className="panel conversation">
          <div className="section-title"><div><p className="eyebrow">Solicitud entre nodos</p><h2>{active.name} solicita información a {targetNode}</h2></div></div>
          <p>La solicitud se replica, el nodo destinatario la aprueba y luego responde con una actividad vinculada.</p>
          <form onSubmit={createRequest}><label>¿Qué necesitás saber?<textarea required value={requestMessage} onChange={(event) => setRequestMessage(event.target.value)} placeholder="Ej.: Confirmá el estado del diagnóstico de refunds y compartí la evidencia." rows={3} /></label><button disabled={busy} type="submit">Solicitar a {targetNode}</button></form>
          <div className="conversation-actions"><button className="ghost action-link" disabled={busy} onClick={loadRequests}>Ver solicitudes de este nodo</button>{requests.map((task) => <article className="message-card" key={task.task_id}><strong>{task.spec.action.title || 'Solicitud'}</strong><p>{task.spec.action.message}</p><small>{task.task_id} · {task.approved ? 'aprobada' : 'pendiente de aprobación'}</small></article>)}</div>
        </section>
        <section className="panel conversation reply">
          <div className="section-title"><div><p className="eyebrow">Respuesta</p><h2>Responder una solicitud</h2></div></div>
          <p>Elegí el nodo que recibió la solicitud, aprobala y respondé con el mismo ID. La respuesta se sincroniza al otro nodo.</p>
          <form onSubmit={sendReply}><label>ID de solicitud<input required value={replyTaskId} onChange={(event) => setReplyTaskId(event.target.value)} placeholder="task_…" spellCheck="false" /></label><label>Respuesta<textarea required value={replyDetails} onChange={(event) => setReplyDetails(event.target.value)} placeholder="Respuesta, evidencia y próximos pasos" rows={3} /></label><button disabled={busy} type="submit">Responder desde {active.name}</button></form>
          <div className="conversation-actions"><button className="ghost action-link" disabled={busy} onClick={loadResponses}>Ver respuestas recibidas</button>{responses.map((response) => <article className="message-card" key={response.event_id}><strong>{response.title}</strong><p>{response.content}</p><small>{response.actor || 'sin autor'} · {response.occurred_at}</small></article>)}</div>
        </section>
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
