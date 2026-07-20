import { MountOnFocus } from '@/components/mount-on-focus';
import { LibraryScreen } from '@/features/library/library-screen';

export default function LibraryRoute() {
  return (
    <MountOnFocus>
      <LibraryScreen />
    </MountOnFocus>
  );
}
