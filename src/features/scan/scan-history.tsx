import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Scan } from '@/domain/scans';
import { SCAN_KIND_INFO } from '@/features/scan/scan-kind-info';
import {
  formatRelativeTime,
  hasParsingScan,
  pageCountLabel,
  SCAN_POLL_INTERVAL_MS,
  SCAN_STATUS_PRESENTATION,
} from '@/features/scan/scan-status';
import { useTheme } from '@/hooks/use-theme';
import { deleteScan, listScans, queryKeys } from '@/lib/queries';

interface ScanRowProps {
  scan: Scan;
  now: Date;
  onPress: () => void;
  onLongPress: () => void;
}

function ScanRow({ scan, now, onPress, onLongPress }: ScanRowProps) {
  const theme = useTheme();
  const info = SCAN_KIND_INFO[scan.kind];
  const status = SCAN_STATUS_PRESENTATION[scan.status];
  const subtitle = `${pageCountLabel(scan.pagePaths.length)} · ${formatRelativeTime(scan.createdAt, now)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${info.label}, ${status.label}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Surface style={styles.rowSurface}>
        <View style={[styles.rowIcon, { backgroundColor: theme.primarySoft }]}>
          <SymbolView name={info.icon} size={20} tintColor={theme.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
            {info.label}
          </Text>
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
        <SymbolView
          name="chevron.right"
          size={13}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Surface>
    </Pressable>
  );
}

function ImportBookRow({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Import the whole book"
      onPress={onPress}
      style={({ pressed }) => [styles.importRowWrap, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Surface style={styles.rowSurface}>
        <View style={[styles.rowIcon, { backgroundColor: theme.primarySoft }]}>
          <SymbolView name="book.closed" size={20} tintColor={theme.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
            Import the whole book
          </Text>
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            Turn the curriculum PDF into cards
          </Text>
        </View>
        <SymbolView
          name="chevron.right"
          size={13}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Surface>
    </Pressable>
  );
}

export function ScanHistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const scansQuery = useQuery({
    queryKey: queryKeys.scans,
    queryFn: listScans,
    refetchInterval: (query) => (hasParsingScan(query.state.data) ? SCAN_POLL_INTERVAL_MS : false),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteScan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.scans });
    },
    onError: (error: Error) => {
      Alert.alert('Something went wrong', error.message);
    },
  });

  const openScan = (scan: Scan) => {
    router.push(`/scan/${scan.id}/review`);
  };

  const confirmDelete = (scan: Scan) => {
    Alert.alert(
      'Delete this scan?',
      'Its photos and parsed rows are removed. Cards you already saved stay in your library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate(scan.id);
          },
        },
      ],
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await scansQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const now = new Date();

  let body;
  if (scansQuery.isPending) {
    body = <LoadingState label="Loading your scans" />;
  } else if (scansQuery.isError) {
    body = (
      <ErrorState
        message={scansQuery.error.message}
        onRetry={() => {
          void scansQuery.refetch();
        }}
      />
    );
  } else if (scansQuery.data.length === 0) {
    body = (
      <EmptyState
        icon="doc.text.viewfinder"
        title="No scans yet"
        message="Photograph a workbook page and Mufradat turns it into cards. It reads nouns spreads, verbs spreads, and phrases pages."
        action={{
          label: 'New scan',
          onPress: () => {
            router.push('/scan/new');
          },
        }}
      />
    );
  } else {
    body = (
      <FlatList
        data={scansQuery.data}
        keyExtractor={(scan) => scan.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor={theme.textSecondary}
          />
        }
        renderItem={({ item }) => (
          <ScanRow
            scan={item}
            now={now}
            onPress={() => {
              openScan(item);
            }}
            onLongPress={() => {
              confirmDelete(item);
            }}
          />
        )}
      />
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Scans</ThemedText>
        <Button
          label="New scan"
          icon="plus"
          onPress={() => {
            router.push('/scan/new');
          }}
        />
      </View>
      {!scansQuery.isPending && !scansQuery.isError && (
        <ImportBookRow
          onPress={() => {
            router.push('/scan/import-pdf');
          }}
        />
      )}
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  importRowWrap: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  rowSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  rowSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: 500,
  },
});
