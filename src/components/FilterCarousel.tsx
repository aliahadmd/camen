import { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, label as labelStyle, spacing } from '../theme';
import { FILTERS, getPreset } from '../features/filters';

const ITEM = 56;
const GAP = spacing.m;

/**
 * Horizontally scrolling snap carousel of men's filter presets. Tap = select,
 * swipe = browse. Active swatch springs to full size; the rest ghost down.
 */
export function FilterCarousel({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [padding, setPadding] = useState<number>(GAP);
  const index = Math.max(
    0,
    FILTERS.findIndex((f) => f.id === selectedId),
  );

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (ITEM + GAP));
    const f = FILTERS[Math.min(FILTERS.length - 1, Math.max(0, idx))];
    if (f && f.id !== selectedId) onSelect(f.id);
  };

  return (
    <FlatList
      data={FILTERS}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={ITEM + GAP}
      decelerationRate="fast"
      keyExtractor={(f) => f.id}
      onScrollEndDrag={onScrollEnd}
      onMomentumScrollEnd={onScrollEnd}
      onLayout={(e) => {
        setPadding(Math.max(GAP, (e.nativeEvent.layout.width - ITEM) / 2));
      }}
      contentContainerStyle={{ paddingHorizontal: padding, gap: GAP }}
      getItemLayout={(_, i) => ({
        length: ITEM + GAP,
        offset: (ITEM + GAP) * i,
        index: i,
      })}
      initialScrollIndex={index}
      renderItem={({ item }) => (
        <FilterItem item={item} active={item.id === selectedId} onSelect={onSelect} />
      )}
    />
  );
}

function FilterItem({
  item,
  active,
  onSelect,
}: {
  item: (typeof FILTERS)[number];
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(active ? 1 : 0.82)).current;
  const prevActive = useRef(active);
  if (prevActive.current !== active) {
    prevActive.current = active;
    Animated.spring(scale, {
      toValue: active ? 1 : 0.82,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }
  const preset = getPreset(item.id);

  return (
    <Pressable
      onPress={() => onSelect(item.id)}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={`Filter ${preset.name}`}
    >
      <Animated.View style={[styles.swatchWrap, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={preset.swatch}
          style={active ? styles.swatchActive : styles.swatchIdle}
        />
      </Animated.View>
      <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
        {preset.name}
      </Text>
      {active ? <View style={styles.underline} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { width: ITEM, alignItems: 'center' },
  swatchWrap: { width: ITEM, height: ITEM, alignItems: 'center', justifyContent: 'center' },
  swatchActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.brass,
  },
  swatchIdle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.hairline,
    opacity: 0.55,
  },
  name: {
    ...labelStyle,
    fontSize: 9,
    marginTop: spacing.xs,
  },
  nameActive: {
    color: colors.bone,
  },
  underline: {
    position: 'absolute',
    bottom: -2,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.brass,
  },
});
