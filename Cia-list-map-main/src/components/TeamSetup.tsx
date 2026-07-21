import { useState } from 'react';
import type { UserProfile, Team, Member, Task } from '../types';
import { collabApi } from '../api/collaboration';

interface Props {
  onComplete: (profile: UserProfile, team: Team, tasks: Task[], members: Member[]) => void;
}

function generateUserId(): string {
  return crypto.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export default function TeamSetup({ onComplete }: Props) {
  const [step, setStep] = useState<'nickname' | 'choice' | 'create' | 'join'>('nickname');
  const [nickname, setNickname] = useState('');
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 步骤 1：设置昵称
  if (step === 'nickname') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 bg-gray-950">
        <h2 className="text-2xl font-bold text-white">欢迎使用团队协作</h2>
        <p className="text-gray-400">先设置你的显示昵称</p>
        <input
          className="w-72 px-4 py-3 rounded-xl bg-gray-800 text-white border border-gray-700 focus:border-cyan-500 outline-none text-center"
          placeholder="你的昵称"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={30}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && nickname.trim() && setStep('choice')}
        />
        <button
          className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors"
          disabled={!nickname.trim()}
          onClick={() => setStep('choice')}
        >
          继续
        </button>
      </div>
    );
  }

  // 步骤 2：选择创建或加入
  if (step === 'choice') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 bg-gray-950">
        <h2 className="text-2xl font-bold text-white">你好，{nickname}</h2>
        <p className="text-gray-400 mb-4">选择你要做的事情</p>
        <div className="flex gap-4">
          <button onClick={() => setStep('create')}
            className="px-10 py-5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-medium text-lg transition-colors">
            🏗️ 创建新团队
          </button>
          <button onClick={() => setStep('join')}
            className="px-10 py-5 bg-gray-700 hover:bg-gray-600 text-white rounded-2xl font-medium text-lg transition-colors">
            👥 加入团队
          </button>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!teamName.trim()) return;
    setLoading(true); setError('');
    try {
      const userId = generateUserId();
      const res = await collabApi.createTeam(teamName.trim(), userId, nickname.trim());
      onComplete({ userId, nickname: nickname.trim() }, res.team, [], []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (inviteCode.trim().length !== 6) return;
    setLoading(true); setError('');
    try {
      const userId = generateUserId();
      const res = await collabApi.joinTeam(inviteCode.trim(), userId, nickname.trim());
      onComplete({ userId, nickname: nickname.trim() }, res.team, res.tasks, res.members);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 步骤 3a：创建团队
  if (step === 'create') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-gray-950">
        <h2 className="text-2xl font-bold text-white">创建新团队</h2>
        <input className="w-72 px-4 py-3 rounded-xl bg-gray-800 text-white border border-gray-700 focus:border-cyan-500 outline-none text-center"
          placeholder="团队名称" value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={50} autoFocus
          onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-3 mt-2">
          <button onClick={() => { setStep('choice'); setError(''); }} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors">返回</button>
          <button onClick={handleCreate} disabled={loading || !teamName.trim()}
            className="px-8 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors">
            {loading ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    );
  }

  // 步骤 3b：加入团队
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-gray-950">
      <h2 className="text-2xl font-bold text-white">加入团队</h2>
      <p className="text-gray-400 text-sm">输入团队创建者分享的 6 位邀请码</p>
      <input className="w-48 text-center px-4 py-3 rounded-xl bg-gray-800 text-white border border-gray-700 focus:border-cyan-500 outline-none tracking-[0.3em] uppercase text-lg"
        placeholder="ABC123" value={inviteCode}
        onChange={e => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        maxLength={6} autoFocus
        onKeyDown={e => e.key === 'Enter' && handleJoin()} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-3 mt-2">
        <button onClick={() => { setStep('choice'); setError(''); }} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors">返回</button>
        <button onClick={handleJoin} disabled={loading || inviteCode.length !== 6}
          className="px-8 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors">
          {loading ? '加入中...' : '加入'}
        </button>
      </div>
    </div>
  );
}
