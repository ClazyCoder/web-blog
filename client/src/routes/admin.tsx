import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import api from '../utils/api';
import McpClients from '../components/McpClients';
import './admin.css';

interface ImageItem { id: number; filename: string; original_filename: string; file_url: string; file_size: number; created_at: string; mcp_managed?: boolean }
interface Stats { total_active_images: number; orphan_images: number; orphan_expired: number; soft_deleted_images: number; purgeable_images: number; policy: { orphan_ttl_hours: number; soft_delete_ttl_days: number } }
interface Change { request_id: string; state: string; action: string; target_id: number | null; client_id: string; created_at: number; expires_at: number }
interface Connection { id: string; client_id: string; scopes: string[]; expires_at: number; csrf: string; status: 'token_issued' | 'awaiting_exchange' | 'incomplete' }
interface Event { id: string; at: number; event: string; request_id: string | null; details: Record<string, unknown> }
interface MCP { enabled: boolean; resource: string; oauth_mode: string; requests: Change[]; connections: Connection[]; events: Event[] }
type Tab = 'requests' | 'connections' | 'images' | 'history';
type Confirmation = { kind: 'images'; images: ImageItem[] } | { kind: 'cleanup' } | { kind: 'revoke'; connection: Connection };
const stateLabel: Record<string, string> = { pending: '승인 대기', executed: '실행 완료', rejected: '거절', stale: '원본 변경', expired: '만료' };
const actionLabel: Record<string, string> = { 'post.create': '글 작성', 'post.update': '글 수정', 'post.delete': '글 삭제', 'image.upload': '이미지 업로드', 'image.update': '이미지 정보 수정', 'image.replace': '이미지 교체', 'image.delete': '이미지 삭제' };
const scopeLabel: Record<string, string> = { 'blog:read': '공개 글 읽기', 'blog:read_private': '비공개 글 읽기', 'blog:propose': '글 변경 제안', 'images:read': '공개 이미지 읽기', 'images:read_private': '비공개 이미지 읽기', 'images:propose': '이미지 변경 제안' };
const date = (value: number) => new Date(value * 1000).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Admin() {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>('requests');
    const [mcp, setMcp] = useState<MCP | null>(null);
    const [registryRefreshVersion, setRegistryRefreshVersion] = useState(0);
    const [disabled, setDisabled] = useState(false);
    const [stats, setStats] = useState<Stats | null>(null);
    const [images, setImages] = useState<ImageItem[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [filter, setFilter] = useState('pending');
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const dialog = useRef<HTMLDialogElement>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const results = await Promise.allSettled([
            api.get<MCP>('/api/mcp/admin', { params: { offset } }),
            api.get<Stats>('/api/upload/admin/orphans'),
            api.get<{ images: ImageItem[] }>('/api/upload/admin/orphans/list'),
        ]);
        const [mcpResult, statsResult, imagesResult] = results;
        if (mcpResult.status === 'fulfilled') { setMcp(mcpResult.value.data); setDisabled(false); setRegistryRefreshVersion(value => value + 1); }
        else if (axios.isAxiosError(mcpResult.reason) && mcpResult.reason.response?.status === 404) { setDisabled(true); setMcp(null); }
        else { setMcp(null); setError('MCP 정보를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.'); }
        if (statsResult.status === 'fulfilled') setStats(statsResult.value.data);
        if (imagesResult.status === 'fulfilled') {
            setImages(imagesResult.value.data.images);
            setSelected(current => new Set([...current].filter(id => imagesResult.value.data.images.some(image => image.id === id))));
        }
        if (statsResult.status === 'rejected' || imagesResult.status === 'rejected') setError(current => `${current} 이미지 정보를 불러오지 못했습니다. 다시 시도해 주세요.`.trim());
        setLoading(false);
    }, [offset]);

    useEffect(() => { if (!authLoading && !isAuthenticated) navigate('/login?redirect=/admin'); }, [authLoading, isAuthenticated, navigate]);
    useEffect(() => { if (isAuthenticated) void refresh(); }, [isAuthenticated, refresh]);
    useEffect(() => { if (confirmation) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmation]);

    const execute = async () => {
        if (!confirmation || busyRef.current) return;
        busyRef.current = true;
        setBusy(true); setError(''); setMessage('');
        try {
            if (confirmation.kind === 'images') {
                let deleted = 0;
                for (const image of confirmation.images) {
                    try { await api.delete(`/api/upload/image/${encodeURIComponent(image.filename)}`); deleted++; }
                    catch { /* Failed items remain selected for explicit retry. */ }
                }
                setMessage(`${confirmation.images.length}개 중 ${deleted}개 삭제 완료.`);
                if (deleted !== confirmation.images.length) setError('일부 이미지를 삭제하지 못했습니다. 남은 항목을 확인하고 다시 시도해 주세요.');
            } else if (confirmation.kind === 'cleanup') {
                const { data } = await api.post('/api/upload/admin/cleanup');
                setMessage(data.skipped ? '다른 정리 작업이 실행 중입니다. 잠시 후 다시 확인해 주세요.' : `미연결 이미지 ${data.orphan_cleanup?.deleted ?? 0}개 정리, 보존 기간이 지난 이미지 ${data.purge_soft_deleted?.purged ?? 0}개 영구 삭제.`);
            } else {
                const { connection } = confirmation;
                await api.post(`/api/mcp/admin/connections/${connection.id}/revoke`, new URLSearchParams({ csrf: connection.csrf, confirm: 'revoke' }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                setMessage('연결을 해제했습니다. 해당 연결의 토큰과 대기 중 변경 요청은 더 이상 사용할 수 없습니다.');
            }
            setConfirmation(null);
            await refresh();
        } catch { setError('작업을 완료하지 못했습니다. 새로고침 후 상태를 확인해 주세요.'); }
        finally { busyRef.current = false; setBusy(false); }
    };

    if (authLoading || !isAuthenticated) return <p className="admin-loading" role="status">관리자 계정 확인 중…</p>;
    const visible = mcp?.requests.filter(r => filter === 'all' || r.state === filter) ?? [];
    const pending = mcp?.requests.filter(r => r.state === 'pending').length ?? 0;
    return <div className="admin-hub">
        <header className="admin-heading"><div><p className="admin-eyebrow">블로그 관리</p><h1>MCP 및 이미지 관리</h1><p>AI의 변경 제안을 검토하고 연결 권한과 이미지를 관리할 수 있습니다.</p></div><button onClick={() => { setError(''); void refresh(); }} disabled={loading || busy}>새로고침</button></header>
        <nav className="admin-tabs" aria-label="관리 영역">
            {([['requests', '승인 요청'], ['connections', '연결·권한'], ['images', '이미지'], ['history', '처리 이력']] as const).map(([key, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}{key === 'requests' && pending > 0 && <span className="admin-count">{pending}</span>}</button>)}
        </nav>
        {error && <p role="alert" className="admin-alert">{error}</p>}
        {message && <p role="status" className="admin-notice">{message}</p>}
        {loading && <p role="status" className="admin-muted">최신 상태를 불러오는 중…</p>}
        {disabled && tab !== 'images' && <section className="admin-empty"><h2>MCP가 비활성화되어 있습니다</h2><p>서버에서 공개 HTTPS 주소와 MCP 활성화를 설정한 뒤 다시 확인해 주세요. 클라이언트 사전 등록은 필요하지 않습니다. 이미지 관리는 사용할 수 있습니다.</p><button onClick={() => setTab('images')}>이미지 관리 열기</button></section>}
        {tab === 'requests' && mcp && <section aria-label="승인 요청 목록">
            <div className="admin-toolbar"><div><h2>변경 승인 요청</h2><p>연결을 허용한 후에도 글과 이미지 변경은 건별로 승인해야 합니다.</p></div><label>표시 <select value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">승인 대기</option><option value="all">전체 상태</option><option value="executed">실행 완료</option><option value="rejected">거절</option><option value="stale">원본 변경</option><option value="expired">만료</option></select></label></div>
            {visible.length === 0 ? <div className="admin-empty"><h3>표시할 요청이 없습니다</h3><p>AI가 제안한 변경 사항이 여기에 표시됩니다.</p></div> : <div className="admin-rows">{visible.map(r => <article key={r.request_id} className="admin-request"><div><span className={`admin-badge ${r.state === 'pending' ? 'pending' : ''}`}>{stateLabel[r.state] ?? r.state}</span><h3>{actionLabel[r.action] ?? r.action}{r.target_id ? ` · #${r.target_id}` : ''}</h3><p>{r.client_id} · {date(r.created_at)}</p>{r.state === 'pending' && <small>{date(r.expires_at)}까지 검토</small>}</div><a className="admin-button" href={`/api/mcp/review/${encodeURIComponent(r.request_id)}`}>{r.state === 'pending' ? '변경 검토' : '상세 보기'} <span aria-hidden="true">↗</span></a></article>)}</div>}
            <div className="admin-pagination"><button disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))}>이전</button><span>{offset / 50 + 1}페이지 · 최대 50개</span><button disabled={mcp.requests.length < 50 || loading} onClick={() => setOffset(offset + 50)}>다음</button></div>
        </section>}
        {tab === 'connections' && mcp && <section>
            <McpClients resource={mcp.resource} refreshVersion={registryRefreshVersion} onChanged={refresh} />
            <div className="admin-toolbar"><div><h2>연결 진행 상태·허용된 권한</h2><p>앱 등록과 권한 동의만으로 연결이 완료되지는 않습니다. 클라이언트가 인증 코드를 교환해야 토큰이 발급됩니다.</p></div></div>
            {mcp.connections.length === 0 ? <div className="admin-empty">허용된 연결이 없습니다. MCP 클라이언트에서 연결을 시작해 주세요.</div> : mcp.connections.map(connection => <article className="admin-connection" key={connection.id}><div><h3>{connection.client_id}</h3><span className="admin-badge">{connection.status === 'token_issued' ? '토큰 발급 완료' : connection.status === 'awaiting_exchange' ? '클라이언트 인증 코드 교환 대기' : '유효한 토큰 없음 · 재연결 필요'}</span><p>{connection.status === 'token_issued' ? `권한 동의 기한: ${date(connection.expires_at)}` : '클라이언트에서 연결이 완료되지 않았다면 연결 절차를 다시 시작해 주세요.'}</p><div className="admin-scopes">{connection.scopes.map(scope => <span key={scope}>{scopeLabel[scope] ?? scope}</span>)}</div></div><button onClick={() => setConfirmation({ kind: 'revoke', connection })} disabled={busy}>연결 해제</button></article>)}
            <p className="admin-muted">연결을 해제하면 해당 토큰과 승인 대기 요청이 즉시 무효화됩니다. 이미 실행한 변경은 유지됩니다.</p>
        </section>}
        {tab === 'images' && <section>
            <div className="admin-toolbar"><div><h2>미연결 이미지</h2><p>글에 연결되지 않은 이미지를 선택하여 정리할 수 있습니다.</p></div><details className="admin-more"><summary>추가 작업</summary><button onClick={() => setConfirmation({ kind: 'cleanup' })} disabled={busy}>미연결 이미지 일괄 정리</button><p>MCP 보존 이미지는 일괄 정리에서 제외됩니다.</p></details></div>
            {stats && <dl className="admin-stats"><div><dt>전체 이미지</dt><dd>{stats.total_active_images}</dd></div><div><dt>미연결</dt><dd>{stats.orphan_images}</dd></div><div><dt>자동 정리 대상</dt><dd>{stats.orphan_expired}</dd></div><div><dt>소프트 삭제</dt><dd>{stats.soft_deleted_images}</dd></div><div><dt>영구 삭제 대상</dt><dd>{stats.purgeable_images}</dd></div></dl>}
            <div className="admin-selection"><label><input type="checkbox" checked={images.length > 0 && selected.size === images.length} onChange={e => setSelected(e.target.checked ? new Set(images.map(i => i.id)) : new Set())} /> 전체 선택</label><span>{selected.size}개 선택</span>{selected.size > 0 && <button className="admin-danger" disabled={busy} onClick={() => setConfirmation({ kind: 'images', images: images.filter(i => selected.has(i.id)) })}>선택 항목 삭제</button>}</div>
            {images.length === 0 ? <div className="admin-empty">미연결 이미지가 없습니다.</div> : <div className="admin-image-grid">{images.map(image => <label className={`admin-image ${selected.has(image.id) ? 'selected' : ''}`} key={image.id}><input type="checkbox" aria-label={`${image.original_filename} 선택`} checked={selected.has(image.id)} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(image.id); else next.delete(image.id); return next; })} /><img src={image.file_url} alt="" loading="lazy" /><div><strong title={image.original_filename}>{image.original_filename}</strong><small>{(image.file_size / 1024).toFixed(1)} KB · {new Date(image.created_at).toLocaleDateString('ko-KR')}</small>{image.mcp_managed && <span className="admin-badge">MCP 보존</span>}</div></label>)}</div>}
            {stats && <p className="admin-muted">일반 미연결 이미지는 {stats.policy.orphan_ttl_hours}시간 후 정리하고, 소프트 삭제 이미지는 {stats.policy.soft_delete_ttl_days}일 후 영구 삭제합니다. MCP 보존 이미지는 자동 정리에서 제외됩니다.</p>}
        </section>}
        {tab === 'history' && mcp && <section><div className="admin-toolbar"><div><h2>최근 처리 이력</h2><p>최근 50개 기록 · 비밀번호와 토큰 원문은 기록하지 않습니다.</p></div></div>{mcp.events.length === 0 ? <div className="admin-empty">처리 이력이 없습니다.</div> : <ol className="admin-history">{mcp.events.map(event => <li key={event.id}><time>{date(event.at)}</time><div><strong>{event.event}</strong>{event.request_id && <a href={`/api/mcp/review/${encodeURIComponent(event.request_id)}`}>요청 보기</a>}<details><summary>기록 상세</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details></div></li>)}</ol>}</section>}
        <dialog ref={dialog} className="admin-dialog" aria-labelledby="admin-confirm-title" onCancel={e => { if (busy) e.preventDefault(); else setConfirmation(null); }}>
            <h2 id="admin-confirm-title">{confirmation?.kind === 'revoke' ? '이 연결을 해제하시겠습니까?' : confirmation?.kind === 'cleanup' ? '미연결 이미지를 일괄 정리하시겠습니까?' : '선택한 이미지를 삭제하시겠습니까?'}</h2>
            {confirmation?.kind === 'images' && <><p>선택한 {confirmation.images.length}개 이미지의 파일을 영구 삭제합니다. 직접 선택한 MCP 보존 이미지도 삭제됩니다.</p><ul>{confirmation.images.map(i => <li key={i.id}>{i.original_filename}</li>)}</ul></>}
            {confirmation?.kind === 'cleanup' && <p>일반 미연결 이미지는 경과 시간과 관계없이 삭제하고, 보존 기간이 지난 삭제 이미지도 영구 삭제합니다. MCP 보존 이미지는 제외됩니다.</p>}
            {confirmation?.kind === 'revoke' && <p>{confirmation.connection.client_id}의 연결을 해제합니다. 기존 토큰과 대기 중 요청이 무효화됩니다.</p>}
            {error && <p role="alert">{error}</p>}<div className="admin-dialog-actions"><button disabled={busy} onClick={() => setConfirmation(null)}>취소</button><button disabled={busy} className="admin-danger" onClick={() => void execute()}>{busy ? '처리 중…' : confirmation?.kind === 'revoke' ? '연결 해제' : '삭제 실행'}</button></div>
        </dialog>
    </div>;
}
