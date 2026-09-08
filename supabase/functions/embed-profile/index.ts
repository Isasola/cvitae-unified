import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  // Require service role — this function is called server-side only
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userId: string | undefined = body?.user_id;

  // Build query: specific user or all users missing embedding
  let query = supabase
    .from('user_master_profiles')
    .select('user_id, professional_title, profile_data')
    .is('embedding', null)
    .limit(50);

  if (userId) query = query.eq('user_id', userId);

  const { data: profiles, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  if (!profiles?.length) {
    return new Response(JSON.stringify({ done: true, processed: 0 }), { status: 200 });
  }

  // @ts-ignore Supabase Edge Runtime API
  const session = new Supabase.ai.Session('gte-small');

  let processed = 0;
  for (const profile of profiles) {
    const title = String(profile.professional_title ?? '');
    const data = profile.profile_data ?? {};
    const skills = Array.isArray(data.habilidades) ? data.habilidades.join(', ') : '';
    const seniority = String(data.seniority ?? '');
    const location = String(data.location ?? '');
    const route = String(data.career_route ?? '');

    const text = [title, seniority, skills, route, location].filter(Boolean).join(' | ');
    if (!text.trim()) continue;

    try {
      const result = await session.run(text.slice(0, 512), { mean_pool: true, normalize: true });
      const embedding = Array.from(result);
      await supabase
        .from('user_master_profiles')
        .update({ embedding })
        .eq('user_id', profile.user_id);
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
