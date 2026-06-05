import { DeleteConfirmClient } from './confirm-client';

/**
 * /account/delete/confirm — the side-effect-free landing page for the deletion
 * confirmation email link (plan Unit 6).
 *
 * This is a server component that performs NO mutation on GET. Email scanners
 * and link-preview bots fire GETs, so the actual erasure must never happen here
 * — it runs only when the user explicitly clicks the confirm button, which
 * POSTs the token to /api/account/delete/confirm with their active session.
 *
 * The token arrives in the query string and is handed to the client component
 * purely so it can be echoed back in the POST body; the page itself reads no
 * user data and touches no DB.
 */
export default function DeleteConfirmPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === 'string' ? searchParams.token : '';
  return <DeleteConfirmClient token={token} />;
}
