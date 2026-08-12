import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import type { BrpDifficulty, DiceExpression, DiceRoll } from '../shared/dice.js';
import type { SessionState } from '../shared/contracts.js';
import type { StoredEquipmentItem } from '../shared/equipment.js';
import { api } from './http.js';

export interface CharacterRecord {
  player_name: string;
  user_id: string;
  nom: string;
  espece: string | null;
  genre: string | null;
  age: number | null;
  profession: string | null;
  richesse: string | null;
  traits: string | null;
  notes: string | null;
  force: number;
  constitution: number;
  taille: number;
  intelligence: number;
  pouvoir: number;
  dexterite: number;
  charisme: number;
  rerolls_used: number;
}

export interface InventoryRecord {
  user_id: string;
  room_code: string;
  player_name: string;
  character_name: string;
  po: number;
  pa: number;
  pc: number;
  weapons: StoredEquipmentItem[];
  armors: StoredEquipmentItem[];
  equipment: StoredEquipmentItem[];
  consumables: StoredEquipmentItem[];
  miscellaneous: StoredEquipmentItem[];
}

export interface SheetRecord {
  user_id: string;
  room_code: string;
  player_name: string;
  character_name: string;
  sheet_data: Record<string, unknown>;
  markdown_content: string;
}

export interface RollRecord {
  id: number;
  created_at: string;
  player_name: string;
  expression: string;
  rolls_detail: string;
  total: number;
  is_hidden: boolean;
}

export interface HiddenRollResult {
  accepted: boolean;
  id: number;
  is_owner: boolean;
  total: number | null;
  rolls_detail: string | null;
}

export interface CharacterInvitation {
  invitation_id: number;
  room_code: string;
  player_name: string;
  character_name: string;
  source_room: string;
}

export interface InvitableCharacter {
  user_id: string;
  player_name: string;
  character_name: string;
  source_room: string;
}

export interface CharacterBackup {
  format: 'dice-forge-character-backup';
  version: 1;
  exportedAt: string;
  account: { id: string; email: string | null };
  characters: Record<string, unknown>[];
  sheets: Record<string, unknown>[];
  inventories: Record<string, unknown>[];
}

function playerEmail(playerName: string): string {
  const slug = playerName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  if (!slug) throw new Error('Nom de joueur invalide.');
  return `${slug}@diceforge.app`;
}

export class CloudService {
  #client?: SupabaseClient;

  async initialize(): Promise<void> {
    if (this.#client) return;
    const config = await api<{ url: string; anonKey: string }>('/api/cloud-config');
    this.#client = createClient(config.url, config.anonKey);
  }

  async user(): Promise<User | null> {
    await this.initialize();
    return (await this.#client!.auth.getSession()).data.session?.user ?? null;
  }

  async login(playerName: string, password: string): Promise<User> {
    await this.initialize();
    const { data, error } = await this.#client!.auth.signInWithPassword({ email: playerEmail(playerName), password });
    if (error || !data.user) throw new Error(error?.message || 'Connexion impossible.');
    return data.user;
  }

  async logout(): Promise<void> { await this.#client?.auth.signOut(); }

  async joinRoom(session: SessionState): Promise<void> {
    const user = await this.requireUser();
    if (!session.room || !session.playerName) throw new Error('Renseignez le joueur et la room.');
    const rooms = this.#client!.from('rooms');
    const existing = await rooms.select('room_code').eq('room_code', session.room).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) {
      const created = await rooms.insert({ room_code: session.room, owner_id: user.id, owner_name: session.playerName });
      if (created.error) throw created.error;
    }
    const joined = await this.#client!.rpc('join_room_with_character', { requested_room: session.room, requested_player: session.playerName });
    if (joined.error) {
      if (/join_room_with_character|schema cache/i.test(joined.error.message)) throw new Error('La migration des personnages entre rooms manque dans Supabase. Réexécutez supabase-auth.sql.');
      throw joined.error;
    }
  }

  async invitableCharacters(room: string): Promise<InvitableCharacter[]> {
    await this.requireUser();
    const { data, error } = await this.#client!.rpc('list_invitable_characters', { requested_room: room });
    if (error) throw error;
    return (data ?? []) as InvitableCharacter[];
  }

  async inviteCharacter(room: string, targetUserId: string, sourceRoom: string): Promise<void> {
    await this.requireUser();
    const { error } = await this.#client!.rpc('invite_character', { requested_room: room, target_user: targetUserId, requested_source_room: sourceRoom });
    if (error) throw error;
  }

  async invitations(): Promise<CharacterInvitation[]> {
    await this.requireUser();
    const { data, error } = await this.#client!.rpc('pending_character_invitations');
    if (error) {
      if (/pending_character_invitations|schema cache/i.test(error.message)) return [];
      throw error;
    }
    return (data ?? []) as CharacterInvitation[];
  }

  async acceptInvitation(invitationId: number): Promise<string> {
    await this.requireUser();
    const { data, error } = await this.#client!.rpc('accept_character_invitation', { requested_invitation: invitationId });
    if (error) throw error;
    return String(data || '');
  }

  async character(): Promise<CharacterRecord | null> {
    const user = await this.requireUser();
    const { data, error } = await this.#client!.from('personnages').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as CharacterRecord | null;
  }

  async saveCharacter(record: Omit<CharacterRecord, 'user_id'>): Promise<void> {
    const user = await this.requireUser();
    const { error } = await this.#client!.from('personnages').upsert({ ...record, user_id: user.id }, { onConflict: 'player_name' });
    if (error) throw error;
  }

  async inventory(session: SessionState): Promise<InventoryRecord | null> {
    const user = await this.requireUser();
    let query = this.#client!.from('pj_inventory').select('*').eq('user_id', user.id);
    if (session.room) query = query.eq('room_code', session.room);
    const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as InventoryRecord | null;
  }

  async saveInventory(session: SessionState, inventory: Omit<InventoryRecord, 'user_id' | 'room_code' | 'player_name'>, playerName = session.playerName): Promise<void> {
    const user = await this.requireUser();
    const { error } = await this.#client!.from('pj_inventory').upsert({ ...inventory, user_id: user.id, room_code: session.room, player_name: playerName }, { onConflict: 'room_code,player_name' });
    if (error) throw error;
  }

  async sheet(session: SessionState): Promise<SheetRecord | null> {
    const user = await this.requireUser();
    let query = this.#client!.from('pj_sheets').select('*').eq('user_id', user.id);
    if (session.room) query = query.eq('room_code', session.room);
    const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as SheetRecord | null;
  }

  async saveSheet(session: SessionState, sheet: Omit<SheetRecord, 'user_id' | 'room_code' | 'player_name'>, playerName = session.playerName): Promise<void> {
    const user = await this.requireUser();
    const { error } = await this.#client!.from('pj_sheets').upsert({ ...sheet, user_id: user.id, room_code: session.room, player_name: playerName }, { onConflict: 'room_code,player_name' });
    if (error) throw error;
  }

  async changePassword(password: string): Promise<void> {
    await this.requireUser();
    const { error } = await this.#client!.auth.updateUser({ password });
    if (error) throw error;
  }

  async characterBackup(): Promise<CharacterBackup> {
    const user = await this.requireUser();
    const [characters, sheets, inventories] = await Promise.all([
      this.#client!.from('personnages').select('*'),
      this.#client!.from('pj_sheets').select('*'),
      this.#client!.from('pj_inventory').select('*'),
    ]);
    const error = characters.error || sheets.error || inventories.error;
    if (error) throw error;
    return {
      format: 'dice-forge-character-backup', version: 1, exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email ?? null },
      characters: (characters.data ?? []) as Record<string, unknown>[],
      sheets: (sheets.data ?? []) as Record<string, unknown>[],
      inventories: (inventories.data ?? []) as Record<string, unknown>[],
    };
  }

  async rolls(room: string): Promise<RollRecord[]> {
    await this.requireUser();
    const { data, error } = await this.#client!.from('rolls').select('id,created_at,player_name,expression,rolls_detail,total,is_hidden').eq('room_code', room).order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    return (data ?? []) as RollRecord[];
  }

  async isRoomOwner(room: string): Promise<boolean> {
    const user = await this.requireUser();
    if (!room) return false;
    const { data, error } = await this.#client!.from('rooms').select('owner_id').eq('room_code', room).maybeSingle();
    if (error) throw error;
    return data?.owner_id === user.id;
  }

  async publicRolls(room: string): Promise<RollRecord[]> {
    await this.initialize();
    const { data, error } = await this.#client!.from('obs_rolls').select('id:roll_id,created_at,player_name,expression,rolls_detail,total,is_hidden').eq('room_code', room).order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    return (data ?? []) as RollRecord[];
  }

  async saveRoll(session: SessionState, roll: DiceRoll, hidden = false): Promise<void> {
    if (hidden) throw new Error('Un jet caché doit être généré par le serveur sécurisé.');
    const user = await this.requireUser();
    await this.joinRoom(session);
    const detail = roll.results.map((result) => `D${result.sides}[${result.values.join(',')}]`).join(' + ');
    const { error } = await this.#client!.from('rolls').insert({ room_code: session.room, player_name: session.playerName, user_id: user.id, expression: roll.expression, rolls_detail: detail, total: roll.total, is_crit: false, is_fail: false, is_hidden: hidden });
    if (error) throw error;
  }

  async rollHidden(session: SessionState, expression: DiceExpression, label = expression.source, experience?: { skill: string; difficulty: BrpDifficulty }): Promise<HiddenRollResult> {
    await this.requireUser();
    await this.joinRoom(session);
    const { data, error } = await this.#client!.rpc('roll_hidden_dice', {
      requested_room: session.room,
      requested_player: session.playerName,
      requested_expression: label,
      requested_terms: expression.dice,
      requested_modifier: expression.modifier,
      requested_experience_skill: experience?.skill ?? '',
      requested_difficulty: experience?.difficulty ?? 'normal',
    });
    if (error) {
      if (/roll_hidden_dice|schema cache/i.test(error.message)) throw new Error('La fonction de jet caché manque dans Supabase. Réexécutez supabase-auth.sql.');
      throw error;
    }
    const result = data as HiddenRollResult | null;
    if (!result?.accepted) throw new Error('Le serveur a refusé le jet caché.');
    return result;
  }

  async revealHiddenExperience(room: string): Promise<number> {
    await this.requireUser();
    const { data, error } = await this.#client!.rpc('reveal_hidden_experience', { requested_room: room });
    if (error) {
      if (/reveal_hidden_experience|schema cache/i.test(error.message)) throw new Error('La révélation d’expérience manque dans Supabase. Réexécutez supabase-auth.sql.');
      throw error;
    }
    return Number(data) || 0;
  }

  async requireUser(): Promise<User> {
    const user = await this.user();
    if (!user) throw new Error('Connectez-vous à Supabase.');
    return user;
  }
}

export const cloud = new CloudService();
