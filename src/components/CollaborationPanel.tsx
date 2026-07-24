import { useState, useCallback, useEffect, useRef } from 'react';
import type { CollabState, WsMessage, Collaborator } from '../types';
import { wsClient } from '../api/websocket';
import { Panel, SectionTitle, Button, TextInput, Badge, cn } from './ui';

interface Props {
  collabState: CollabState;
  wsConnected: boolean;
  onCollabStateChange: (s: CollabState) => void;
  onTasksReceived: (tasks: Array<Record<string, unknown>>) => void;
  onMemberJoin: (nickname: string) => void;
  onMemberLeave: (nickname: string) => void;
}

export default function CollaborationPanel({
  collabState,
  wsConnected,
  onCollabStateChange,
  onTasksReceived,
  onMemberJoin,
  onMemberLeave,
}: Props) {
  const [groupId, setGroupId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [joining, setJoining] = useState(false);
  const [authError, setAuthError] = useState('');
  const nicknameRef = useRef('');

  // 同步 ref
  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);

  // 注册协作消息处理器
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(wsClient.on('auth_ok', (msg: WsMessage) => {
      onTasksReceived((msg.tasks as Array<Record<string, unknown>>) || []);
      onCollabStateChange({
        isJoined: true,
        groupId: msg.group_id as string,
        nickname: nicknameRef.current,
        members: (msg.members as Collaborator[]) || [],
      });
      setJoining(false);
      setAuthError('');
    }));

    unsubs.push(wsClient.on('auth_fail', (msg: WsMessage) => {
      setJoining(false);
      setAuthError((msg.reason as string) || '认证失败');
    }));

    unsubs.push(wsClient.on('member_join', (msg: WsMessage) => {
      onMemberJoin(msg.nickname as string);
    }));

    unsubs.push(wsClient.on('member_leave', (msg: WsMessage) => {
      onMemberLeave(msg.nickname as string);
    }));

    return () => unsubs.forEach(fn => fn());
  }, [onCollabStateChange, onTasksReceived, onMemberJoin, onMemberLeave]);

  const handleJoin = useCallback(() => {
    const gid = groupId.trim();
    const pwd = password.trim();
    const nick = nickname.trim();
    if (!gid || !pwd || !nick) return;
    setJoining(true);
    wsClient.send({ type: 'auth', group_id: gid, password: pwd, nickname: nick } as WsMessage);
  }, [groupId, password, nickname]);

  const handleLeave = useCallback(() => {
    wsClient.disconnect();
    setTimeout(() => wsClient.connect(), 100);
    onCollabStateChange({ isJoined: false, groupId: '', nickname: '', members: [] });
  }, [onCollabStateChange]);

  return (
    <Panel className="p-4 lg:p-5">
      <SectionTitle eyebrow="Collaboration" title="云端协作" />

      {!collabState.isJoined ? (
        <div className="space-y-2">
          <TextInput
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            placeholder="组 ID（例如：my-team）"
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            disabled={joining}
          />
          <TextInput
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="组密码"
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            disabled={joining}
          />
          <TextInput
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="你的昵称"
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            disabled={joining}
          />
          <Button
            onClick={handleJoin}
            disabled={joining || !wsConnected || !groupId.trim() || !password.trim() || !nickname.trim()}
            variant="primary"
            className="w-full py-2.5"
          >
            {joining ? '加入中...' : wsConnected ? '加入/创建协作组' : '等待后端连接...'}
          </Button>
          {authError && (
            <p className="text-xs text-red-400 text-center">{authError}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            <span className="text-sm text-slate-300 font-medium">{collabState.groupId}</span>
            <Badge tone="success">
              {collabState.members.filter(m => m.online).length} 人在线
            </Badge>
          </div>
          <div className="space-y-1">
            {collabState.members.map(m => (
              <div
                key={m.nickname}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                  m.online ? 'text-slate-200' : 'text-slate-500',
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full flex-shrink-0',
                  m.online ? 'bg-emerald-400' : 'bg-slate-600',
                )} />
                <span className="truncate">{m.nickname}</span>
                {m.nickname === collabState.nickname && (
                  <span className="text-[10px] text-slate-500 ml-auto">我</span>
                )}
              </div>
            ))}
          </div>
          <Button onClick={handleLeave} variant="ghost" className="w-full text-xs text-slate-500 hover:text-red-300">
            离开协作组
          </Button>
        </div>
      )}
    </Panel>
  );
}
