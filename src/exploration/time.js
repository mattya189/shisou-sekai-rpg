/**
 * ゲーム内時間と天候。リアル時間とは連動しない。
 *
 * 時間は「時間帯（朝・昼・夕方・夜）」と、その中の経過 tick で表す。
 * tick が balance.time.ticksPerPeriod に達すると次の時間帯へ進み、夜の次は翌日の朝。
 * 時間帯が変わるたびに、各地域の天候を抽選し直す。
 */

export function periodIds(data) {
  return data.balance.time.periods.map((p) => p.id);
}

/**
 * @returns {{ periodsPassed: number, dayChanged: boolean }}
 */
export function advanceTime(save, data, ticks, rng) {
  const t = save.exploration.time;
  const ids = periodIds(data);
  const per = data.balance.time.ticksPerPeriod;
  const startDay = t.day;
  let periodsPassed = 0;
  t.tick = (t.tick ?? 0) + Math.max(0, ticks);
  while (t.tick >= per) {
    t.tick -= per;
    const i = ids.indexOf(t.period);
    if (i === ids.length - 1) {
      t.period = ids[0];
      t.day += 1;
    } else {
      t.period = ids[i + 1];
    }
    periodsPassed += 1;
  }
  if (periodsPassed > 0) rollAllWeather(save, data, rng);
  return { periodsPassed, dayChanged: t.day !== startDay };
}

/** 翌日の朝まで進める（宿屋で休むときなど） */
export function advanceToNextMorning(save, data, rng) {
  const t = save.exploration.time;
  t.day += 1;
  t.period = periodIds(data)[0];
  t.tick = 0;
  rollAllWeather(save, data, rng);
}

/** すべての地域の天候を抽選する */
export function rollAllWeather(save, data, rng) {
  for (const region of data.list('regions')) {
    const picked = rng.weighted(region.weatherTable);
    if (picked) save.exploration.weather[region.id] = picked.weatherId;
  }
}

/** 街・地点の地域の現在の天候ID（未抽選なら地域の先頭） */
export function weatherAt(save, data, nodeId) {
  const node = data.findNode(nodeId);
  if (!node?.region) return null;
  return save.exploration.weather[node.region] ?? data.find('regions', node.region)?.weatherTable[0]?.weatherId ?? null;
}

/** 条件判定用の現在の状況 */
export function situationAt(save, data, nodeId) {
  return { period: save.exploration.time.period, weatherId: weatherAt(save, data, nodeId), flags: save.flags };
}
