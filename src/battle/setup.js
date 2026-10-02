/**
 * セーブデータから戦闘の参加者（spec）を作る。
 */
import { partyMembers } from '../progression/party.js';
import { equipmentInstancesOf } from '../progression/equipment.js';
import { currentHp } from '../progression/hp.js';

/**
 * 編成中の味方。特技はセットした順（＝優先順位）で使う。HPはフィールドの現在HPから始まる。
 * mp を渡すと、そのMPから始まる（連戦ダンジョンの持ち越し）。
 */
export function alliesFromParty(save, data, { mp } = {}) {
  // 戦闘は3対3。旧形式の編成が残っていても枠数を超えて出撃させない。
  const size = data?.balance?.party?.size ?? Infinity;
  return partyMembers(save).slice(0, size).map((unitId) => {
    const u = save.units[unitId];
    return {
      unitId,
      defId: u.defId,
      level: u.level,
      rank: u.rank,
      skills: [...u.equippedSkills],
      extraSkills: [...(u.extraSkills ?? [])],
      equipment: equipmentInstancesOf(save, u),
      hp: data ? currentHp(save, data, unitId) : undefined,
      mp: mp?.[unitId],
    };
  });
}
