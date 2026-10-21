import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import api from '../utils/api';

interface Client { client_id: string; client_name: string; redirect_uris: string[]; scopes: string[]; auth_method: string; source: 'manual' | 'automatic'; csrf: string }
interface Registry { clients: Client[]; create_id: string; csrf: string }
type Operation = { action: 'create' | 'update' | 'delete' | 'rotate'; client?: Client };
const labels: Record<string, string> = { 'blog:read': '공개 글 읽기', 'blog:read_private': '비공개 글 읽기', 'blog:propose': '글 변경 제안', 'images:read': '공개 이미지 읽기', 'images:read_private': '비공개 이미지 읽기', 'images:propose': '이미지 변경 제안' };
const verbs = { create: '클라이언트 등록', update: '설정 저장 및 기존 연결 해제', delete: '등록 삭제 및 모든 연결 해제', rotate: '비밀값 재발급 및 기존 연결 해제' };

export default function McpClients({ resource, onChanged }: { resource: string; onChanged: () => Promise<void> }) {
    const [registry, setRegistry] = useState<Registry | null>(null);
    const [operation, setOperation] = useState<Operation | null>(null);
    const [name, setName] = useState('');
    const [callbacks, setCallbacks] = useState('');
    const [method, setMethod] = useState('none');
    const [scopes, setScopes] = useState(['blog:read', 'images:read']);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [issued, setIssued] = useState<{ client_id: string; client_secret: string | null } | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const refresh = useCallback(async () => {
        try { setRegistry((await api.get<Registry>('/api/mcp/admin/clients')).data); }
        catch { setError('클라이언트 목록을 불러오지 못했습니다. 목록을 새로고침해 주세요.'); }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => { if (operation) dialog.current?.showModal(); else dialog.current?.close(); }, [operation]);

    const open = (value: Operation) => {
        setError(''); setMessage(''); setIssued(null); setPassword('');
        setName(value.client?.client_name ?? ''); setCallbacks(value.client?.redirect_uris.join('\n') ?? '');
        setMethod(value.client?.auth_method ?? 'none'); setScopes(value.client?.scopes ?? ['blog:read', 'images:read']);
        setOperation(value);
    };
    const close = () => { if (!busyRef.current) { setPassword(''); setOperation(null); } };
    const save = async () => {
        if (!operation || !registry || busyRef.current) return;
        busyRef.current = true; setBusy(true); setError('');
        const { action, client } = operation;
        try {
            const fields = new URLSearchParams({ action, confirm: action, password,
                client_id: client?.client_id ?? registry.create_id, csrf: client?.csrf ?? registry.csrf });
            if (action === 'create' || action === 'update') fields.set('metadata', JSON.stringify({
                client_name: name.trim(), redirect_uris: callbacks.split('\n').map(x => x.trim()).filter(Boolean),
                scopes, token_endpoint_auth_method: method,
            }));
            const { data } = await api.post('/api/mcp/admin/clients', fields, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            setIssued(action === 'create' || data.client_secret ? data : null);
            setMessage(action === 'create' ? '등록했습니다. 앱에서 연결을 시작한 뒤 별도로 권한을 허용해 주세요.'
                : action === 'delete' ? '등록을 삭제했습니다. 기존 연결과 대기 중인 승인은 무효화되었습니다. 다시 사용하려면 앱을 재등록해 주세요.'
                : '변경했습니다. 기존 연결과 대기 중인 승인은 무효화되었습니다. 사용하려면 앱에서 다시 연결해 주세요.');
            setPassword(''); setOperation(null);
            await refresh(); await onChanged();
        } catch (e) {
            const status = axios.isAxiosError(e) ? e.response?.status : undefined;
            setPassword('');
            setError(status === 403 ? '비밀번호 또는 확인 정보가 유효하지 않습니다. 창을 닫고 목록을 새로고침한 뒤 다시 시도해 주세요.'
                : status === 400 ? '입력을 확인해 주세요. 이름, 권한, HTTPS 또는 localhost 반환 주소가 필요합니다.'
                : '완료 여부를 확인하지 못했습니다. 목록을 새로고침하여 상태를 먼저 확인해 주세요. 비밀값을 받지 못했다면 재발급할 수 있습니다.');
        } finally { busyRef.current = false; setBusy(false); }
    };
    const copy = async (value: string) => {
        try { await navigator.clipboard.writeText(value); setMessage('복사했습니다.'); }
        catch { setError('자동 복사를 사용할 수 없습니다. 표시된 값을 선택하여 복사해 주세요.'); }
    };
    const editing = operation?.action === 'create' || operation?.action === 'update';

    return <div className="mcp-clients">
        <div className="mcp-connect-guide">
            <h2>앱에서 블로그 연결하기</h2>
            <p>ChatGPT·Claude 등 사용하는 앱의 원격 MCP 연결 화면에 아래 주소를 입력해 주세요.</p>
            <div className="admin-endpoint"><code>{resource}</code><button onClick={() => void copy(resource)}>서버 주소 복사</button></div>
            <ol><li>앱에서 서버 주소를 추가합니다.</li><li>열리는 블로그 화면에서 관리자 계정으로 로그인합니다.</li><li>반환 주소와 요청 권한을 확인하고 연결을 허용합니다.</li></ol>
            <p>자동 등록을 지원하는 앱은 ID를 미리 만들 필요가 없습니다. 글과 이미지 변경에는 연결 후에도 건별 승인이 필요합니다.</p>
            <details className="mcp-manual-help"><summary>앱에서 클라이언트 ID·비밀값을 요구하나요?</summary>
                <p>아래에서 수동 등록한 뒤 발급된 정보를 앱에 입력해 주세요. 반환 주소는 해당 앱이 안내한 정확한 OAuth 콜백 주소를 사용합니다. 자동 등록을 지원하지 않는 앱에만 필요합니다.</p>
                <button disabled={!registry || busy} onClick={() => open({ action: 'create' })}>수동 클라이언트 등록</button>
            </details>
        </div>
        {error && !operation && <p role="alert" className="admin-alert">{error}</p>}
        {message && <p role="status" className="admin-notice">{message}</p>}
        {issued && <section className="mcp-issued" aria-label="발급 정보"><h3>앱에 입력할 연결 정보</h3>
            <label>클라이언트 ID<input readOnly value={issued.client_id} onFocus={e => e.currentTarget.select()} /></label>
            {issued.client_secret && <><p>비밀값은 이 화면에서만 표시됩니다. 안전하게 보관해 주세요. 화면을 닫으면 다시 조회할 수 없습니다.</p><label>클라이언트 비밀값<input readOnly type="password" value={issued.client_secret} autoComplete="off" onFocus={e => e.currentTarget.select()} /></label><button onClick={() => void copy(issued.client_secret!)}>비밀값 복사</button></>}
            <button onClick={() => { setIssued(null); setMessage('발급 정보 표시를 닫았습니다.'); }}>발급 정보 닫기</button>
        </section>}
        <div className="admin-toolbar"><div><h2>등록된 앱</h2><p>등록 정보만으로는 접근할 수 없습니다. 아래에서 연결 진행 상태와 허용된 권한을 확인해 주세요.</p></div><button disabled={busy} onClick={() => { setError(''); void refresh(); }}>목록 새로고침</button></div>
        {registry?.clients.length === 0 && <p className="admin-empty">등록된 앱이 없습니다. 위 서버 주소로 앱에서 연결을 시작해 주세요.</p>}
        {registry?.clients.map(client => <details className="mcp-client-row" key={client.client_id}>
            <summary><strong>{client.client_name || '이름 없는 앱'}</strong><span className="admin-badge">{client.source === 'manual' ? '수동 등록' : '자동 등록 · 자체 신고 이름'}</span><span>상세·관리</span></summary>
            <dl><dt>클라이언트 ID</dt><dd><code>{client.client_id}</code></dd><dt>인증 방식</dt><dd>{client.auth_method === 'none' ? 'PKCE · 비밀값 없음' : 'PKCE + 클라이언트 비밀값'}</dd><dt>반환 주소</dt><dd>{client.redirect_uris.map(url => <code key={url}>{url}</code>)}</dd><dt>요청 가능한 권한</dt><dd>{client.scopes.map(s => labels[s] ?? s).join(' · ')}</dd></dl>
            <div className="mcp-client-actions">{client.source === 'manual' && <><button disabled={busy} onClick={() => open({ action: 'update', client })}>설정 수정</button>{client.auth_method !== 'none' && <button disabled={busy} onClick={() => open({ action: 'rotate', client })}>비밀값 재발급</button>}</>}
                <button className="admin-danger" disabled={busy} onClick={() => open({ action: 'delete', client })}>등록 삭제</button></div>
        </details>)}
        <dialog ref={dialog} className="admin-dialog mcp-client-dialog" aria-labelledby="mcp-client-title" onCancel={e => { e.preventDefault(); close(); }}>
            <form onSubmit={e => { e.preventDefault(); void save(); }}>
                <h2 id="mcp-client-title">{operation ? verbs[operation.action] : ''}</h2>
                {operation?.client && <p><strong>{operation.client.client_name || operation.client.client_id}</strong>의 기존 토큰과 대기 중인 승인이 무효화됩니다. 이미 실행된 변경은 유지됩니다. {operation.action === 'delete' ? '앱 등록도 제거됩니다. 다시 사용하려면 재등록한 뒤 연결해야 합니다.' : '다시 사용하려면 앱에서 새로 연결해야 합니다.'}</p>}
                {editing && <><label>앱 이름<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
                    <label>OAuth 반환 주소<textarea required rows={3} value={callbacks} onChange={e => setCallbacks(e.target.value)} placeholder="앱이 안내한 콜백 주소를 한 줄에 하나씩 입력해 주세요." /></label>
                    <label>앱의 인증 방식<select value={method} onChange={e => setMethod(e.target.value)}><option value="none">Public client · PKCE · 비밀값 없음</option><option value="client_secret_post">Confidential client · 비밀값 사용</option></select></label>
                    <fieldset><legend>앱이 요청할 수 있는 권한의 상한</legend><p>실제 접근 권한은 연결 시 별도로 선택합니다.</p>{Object.entries(labels).map(([scope, label]) => <label className="mcp-scope-option" key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={e => setScopes(current => e.target.checked ? [...current, scope] : current.filter(x => x !== scope))} />{label}</label>)}</fieldset></>}
                <label>관리자 비밀번호 확인<input required type="password" autoComplete="current-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} /></label>
                {error && <p role="alert" className="admin-alert">{error}</p>}
                <div className="admin-dialog-actions"><button type="button" disabled={busy} onClick={close}>취소</button><button type="submit" disabled={busy || (editing && scopes.length === 0)} className={operation?.action === 'delete' ? 'admin-danger' : ''}>{busy ? '처리 중…' : operation ? verbs[operation.action] : ''}</button></div>
            </form>
        </dialog>
    </div>;
}
