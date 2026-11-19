import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildProfileEmbeddingText } from '../_shared/embedding.ts';
import { isServiceRoleRequest } from '../_shared/service-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
let embeddingSession: any;

function getEmbeddingSession() {
  // Reuse the native model while the worker remains warm. Recreating sessions
  // across rapid profile updates can exhaust Edge worker resources.
  // @ts-ignore Supabase Edge Runtime API
  embeddingSession ??= new Supabase.ai.Session('gte-small');
  return embeddingSession;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  // Require service role — this function is called server-side only
  if (!isServiceRoleRequest(req, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (Deno.env.get('DISABLE_EMBEDDINGS') === 'true') {
    return new Response(JSON.stringify({ done: false, processed: 0, disabled: true }), { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const userId: string | undefined = body?.user_id;

  // Build query: specific user or all users missing embedding
  let query = supabase
    .from('user_master_profiles')
    .select('user_id, professional_title, summary, profile_data, cv_text')
    .is('embedding', null)
    .not('user_id', 'is', null)
    .limit(50);

  if (userId) query = query.eq('user_id', userId);

  const { data: profiles, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  if (!profiles?.length) {
    return new Response(JSON.stringify({ done: true, processed: 0 }), { status: 200 });
  }

  const session = getEmbeddingSession();

  let processed = 0;
  for (const profile of profiles) {
    const text = buildProfileEmbeddingText(profile);
    if (!text.trim()) continue;

    try {
      const result = await session.run(text, { mean_pool: true, normalize: true });
      const embedding = Array.from(result);
      const { error: updateError } = await supabase
        .from('user_master_profiles')
        .update({ embedding })
        .eq('user_id', profile.user_id);
      if (updateError) throw updateError;
      processed++;
    } catch (e) {
      console.error('embed-profile error for', profile.user_id, e);
    }
  }

  const remaining = profiles.length - processed;
  return new Response(
    JSON.stringify({ done: remaining === 0, processed, remaining }),
    { status: 200 },
  );
});
