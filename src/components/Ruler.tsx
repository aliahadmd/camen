import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { rulerPadding } from '../features/cameraMath';
import { colors, monoFont, spacing } from '../theme';

/**
 * Generic horizontal tick ruler (plan/plan16.md) — used for EV compensation and
 * continuous zoom. Scrolling drives onChange per tick with iPhone-style haptic
 * ticks (selection click on minor ticks, rigid impact on majors); onCommit
 * fires when the gesture ends.
 */
export function Ruler({
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
  format,
  stepPx = 30,
  readoutPrefix,
  unitSuffix,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  onCommit?: (value: number) => void;
  format: (v: number) => string;
  stepPx?: number;
  readoutPrefix?: string;
  unitSuffix?: string;
}) {
  const [width, setWidth] = useState(0);
  const lastTick = useRef<number | null>(null);
  const lastHaptic = useRef(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(0);
  const interacting = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const ticks = useMemo(() => {
    const list: number[] = [];
    const count = Math.round((max - min) / step);
    for (let i = 0; i <= count; i++) list.push(Math.round((min + i * step) * 1000) / 1000);
    return list;
  }, [min, max, step]);

  const isMajor = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

  // Keep the ruler position in sync when `value` changes from outside the
  // gesture (pills, camera switch, capture reset). Small deltas are the
  // user's own scroll — never fight the finger.
  useEffect(() => {
    if (width <= 0 || interacting.current) return;
    const idx = Math.round((value - min) / step);
    const target = idx * stepPx;
    if (Math.abs(scrollX.current - target) > 0.5) {
      scrollRef.current?.scrollTo({ x: target, animated: false });
      scrollX.current = target;
      lastTick.current = idx;
    }
  }, [value, width, min, step, stepPx]);

  const onScroll = (offsetX: number) => {
    scrollX.current = offsetX;
    if (width <= 0) return;
    // padding is half the viewport, so the centered tick index = offset / stepPx
    const i = Math.round(offsetX / stepPx);
    if (i !== lastTick.current) {
      lastTick.current = i;
      const v = ticks[Math.min(ticks.length - 1, Math.max(0, i))];
      if (v != null) { valueRef.current = v; onChange(v); }
      const now = Date.now();
      if (now - lastHaptic.current > 60) {
        lastHaptic.current = now;
        if (v != null && isMajor(v)) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
        } else {
          void Haptics.selectionAsync().catch(() => {});
        }
      }
    }
  };

  const marker = Math.round(value * 100) / 100;

  return (
    <View style={styles.wrap}>
      <View style={styles.rail}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={stepPx}
          onScroll={(e) => onScroll(e.nativeEvent.contentOffset.x)}
          onScrollBeginDrag={() => { interacting.current = true; }}
          onScrollEndDrag={() => { interacting.current = false; onCommit?.(valueRef.current); }}
          onMomentumScrollBegin={() => { interacting.current = true; }}
          onMomentumScrollEnd={() => { interacting.current = false; onCommit?.(valueRef.current); }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          contentContainerStyle={{ paddingHorizontal: rulerPadding(width, stepPx), alignItems: 'flex-start' }}
        >
          {ticks.map((v, i) => (
            <View key={i} style={[styles.tick, { width: stepPx }]}>
              <View style={[styles.line, isMajor(v) && styles.lineMajor]} />
              {isMajor(v) ? (
                <Text style={[styles.tickLabel, Math.abs(marker - v) < 0.001 && styles.tickLabelActive]}>
                  {format(v)}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
        <View style={styles.indicator} pointerEvents="none" />
      </View>
      <Text style={styles.readout}>
        {readoutPrefix ? `${readoutPrefix} ` : ''}
        {format(marker)}
        {unitSuffix ?? ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    paddingBottom: spacing.xs,
  },
  rail: {
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(22,24,27,0.85)',
    overflow: 'hidden',
  },
  tick: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  line: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: 'rgba(232,230,225,0.35)',
  },
  lineMajor: {
    height: 26,
    width: 1.5,
    backgroundColor: 'rgba(232,230,225,0.7)',
  },
  tickLabel: {
    color: 'rgba(232,230,225,0.55)',
    fontSize: 10,
    marginTop: 4,
    ...monoFont,
  },
  tickLabelActive: {
    color: colors.bone,
  },
  indicator: {
    position: 'absolute',
    left: '50%',
    top: 4,
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brass,
  },
  readout: {
    alignSelf: 'center',
    marginTop: spacing.xs,
    color: colors.brass,
    fontSize: 12,
    ...monoFont,
  },
});
