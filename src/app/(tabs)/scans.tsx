import { MountOnFocus } from '@/components/mount-on-focus';
import { ScanHistoryScreen } from '@/features/scan/scan-history';

export default function ScansRoute() {
  return (
    <MountOnFocus>
      <ScanHistoryScreen />
    </MountOnFocus>
  );
}
