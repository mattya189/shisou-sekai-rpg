/**
 * 街の施設の処理。施設の種類（type）ごとに処理を登録する。
 * データ（towns.json）の facilities[].type と対応する。
 * 未登録の type は「準備中」と表示される。
 */

/** 会話・探索系の施設 → events.json の trigger */
const EVENT_FACILITIES = { residents: 'residents', tavern: 'tavern', townExplore: 'townExplore' };

/** @type {Record<string, (ctx: any, facility: any, town: any) => void>} */
export const FACILITY_HANDLERS = {
  inn(ctx, facility) {
    ctx.go('inn', { facilityName: facility.name });
  },
  shop(ctx, facility) {
    ctx.go('shop', { shopId: facility.shopId, facilityName: facility.name });
  },
  workshop(ctx, facility) {
    ctx.go('workshop', { facilityName: facility.name });
  },
  exit(ctx) {
    ctx.go('travel');
  },
};
for (const [type, trigger] of Object.entries(EVENT_FACILITIES)) {
  FACILITY_HANDLERS[type] = (ctx, facility, town) => ctx.go('talk', { trigger, nodeId: town.id, facilityName: facility.name });
}

export function openFacility(ctx, facility, town) {
  const handler = FACILITY_HANDLERS[facility.type];
  if (handler) return handler(ctx, facility, town);
  ctx.toast(`${facility.name}はまだ使えません`);
}
