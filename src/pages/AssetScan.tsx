import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import AuthLayout, { AuthError, AuthNotice } from '../components/AuthLayout';

interface Resolved {
  asset_id: string;
  org_id: string;
  location_id: string | null;
  public_reports: boolean;
  is_member: boolean;
}

// Where a printed asset QR code lands (/a/<qr_code>, audit S1-M2): staff go
// to the asset, a signed-in tenant to their report form for that asset (they
// can't open asset records, 0081), everyone else to the public fault-report
// form (if the organisation allows public reports) or to sign-in.
export default function AssetScan() {
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation('assets');
  const { session } = useAuth();
  // Read through a ref: the lookup below should run once per code, not again
  // whenever the organisation context re-renders.
  const org = useOrg();
  const orgRef = useRef(org);
  orgRef.current = org;
  const navigate = useNavigate();
  const [problem, setProblem] = useState<'unknown' | 'no_access' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc('fp_resolve_asset_qr', { p_code: code ?? '' });
      if (cancelled) return;
      const r = data as Resolved | null;
      if (error || !r) {
        setProblem('unknown');
        return;
      }
      const tenant = orgRef.current.memberships.find((m) => m.org_id === r.org_id)?.role === 'occupant';
      if (r.is_member && tenant) {
        orgRef.current.setCurrentOrg(r.org_id);
        const loc = r.location_id ? `&location=${r.location_id}` : '';
        navigate(`/requests/new?asset=${r.asset_id}${loc}`, { replace: true });
      } else if (r.is_member) {
        navigate(`/assets/${r.asset_id}`, { replace: true });
      } else if (r.public_reports) {
        const loc = r.location_id ? `&location=${r.location_id}` : '';
        navigate(`/report?org=${r.org_id}&asset=${r.asset_id}${loc}`, { replace: true });
      } else if (!session) {
        navigate(`/signin?next=${encodeURIComponent(`/a/${code}`)}`, { replace: true });
      } else {
        setProblem('no_access');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, session, navigate]);

  return (
    <AuthLayout title={t('scan.title')}>
      {problem ? <AuthError>{t(`scan.${problem}`)}</AuthError> : <AuthNotice>{t('scan.opening')}</AuthNotice>}
    </AuthLayout>
  );
}
