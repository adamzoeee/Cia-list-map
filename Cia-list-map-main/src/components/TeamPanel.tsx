import { useState } from 'react';
import type { Team, Member } from '../types';
import { collabApi } from '../api/collaboration';

interface Props {
  team: Team;
  members: Member[];
  userId: string;
  connected: boolean;
  onLeave: () => void;
  onDelete: () => void;
}

export default function TeamPanel({ team, members, userId, connected, onLeave, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const isOwner = members.find(m => m.userId === userId)?.role === 'owner';

  const copyInviteCode = () => {
    navigator.clipboard.writeText(team.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // fallback for non-HTTPS
      const input = document.createElement('input');
      input.value = team.inviteCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLeave = async () => {
    if (!confirm('确定要退出团队吗？')) return;
    try {
      await collabApi.leaveTeam(team.id, userId);
      onLeave();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要解散团队吗？此操作不可撤销！')) return;
    try {
      await collabApi.deleteTeam(team.id, userId);
      onDelete();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50">
      {/* 团队名称 + 连接状态 */}
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-red-400'}`} />
        <span className="text-white font-semibold text-sm">{team.name}</span>
      </div>

      {/* 邀请码复制 */}
      <button onClick={copyInviteCode}
        className="px-3 py-1 text-xs bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg font-mono tracking-wider transition-colors"
        title="点击复制邀请码">
        {copied ? '✓ 已复制' : team.inviteCode}
      </button>

      {/* 在线成员头像 */}
      <div className="flex -space-x-1.5">
        {members.slice(0, 5).map(m => (
          <div key={m.userId} title={m.nickname + (m.role === 'owner' ? ' (创建者)' : '')}
            className={`w-7 h-7 rounded-full border-2 border-gray-800 flex items-center justify-center text-[11px] text-white font-bold ${m.role === 'owner' ? 'bg-amber-600' : 'bg-cyan-700'}`}>
            {m.nickname.charAt(0).toUpperCase()}
          </div>
        ))}
        {members.length > 5 && (
          <div className="w-7 h-7 rounded-full bg-gray-600 border-2 border-gray-800 flex items-center justify-center text-[10px] text-white font-medium">
            +{members.length - 5}
          </div>
        )}
        <span className="text-xs text-gray-400 ml-2">{members.length} 人在线</span>
      </div>

      {/* 操作按钮 */}
      <div className="ml-auto flex gap-2">
        {!isOwner && (
          <button onClick={handleLeave} className="px-3 py-1 text-xs text-gray-400 hover:text-red-400 transition-colors">
            退出团队
          </button>
        )}
        {isOwner && (
          <button onClick={handleDelete} className="px-3 py-1 text-xs text-gray-400 hover:text-red-400 transition-colors">
            解散团队
          </button>
        )}
      </div>
    </div>
  );
}
