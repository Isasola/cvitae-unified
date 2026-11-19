"""
Opportunity Enrichment con Gemini 1.5 Flash

Completa datos faltantes en oportunidades:
- Extrae skills mencionadas en descripción
- Normaliza ubicaciones (ej: "Asunción, PY" → "Asunción, Paraguay")
- Identifica empresa si está mencionada en descripción
- Mejora descripciones muy cortas con contexto
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
LIMIT = int(os.getenv('LIMIT', '50'))

def fetch_opportunities_to_enrich():
    """
    Busca oportunidades que necesitan enrichment:
    - Sin skills
    - Ubicación no normalizada
    - Empresa no identificada
    - Descripción muy corta
    - Creadas en los últimos 7 días
    """
    seven_days_ago = (datetime.now() - timedelta(days=7)).isoformat()

    # Query: oportunidades activas, recientes, sin enrichment previo
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
    }

    # Buscar en content_hub (oportunidades de scrapers)
    response = requests.get(
        f'{SUPABASE_URL}/rest/v1/content_hub',
        headers=headers,
        params={
            'tipo': 'in.(oportunidad,empleo,beca)',
            'created_at': f'gte.{seven_days_ago}',
            'select': 'id,titulo,cuerpo,ubicacion,categoria,metadata',
            'limit': LIMIT,
            'order': 'created_at.desc',
        }
    )

    if not response.ok:
        print(f'❌ Error fetching opportunities: {response.status_code} {response.text}')
        return []

    opportunities = response.json()
    print(f'📊 Found {len(opportunities)} opportunities to potentially enrich')

    # Filtrar las que realmente necesitan enrichment
    to_enrich = []
    for opp in opportunities:
        metadata = opp.get('metadata') or {}
        needs_enrichment = (
            not metadata.get('enriched') and (
                not metadata.get('organization') or
                len(opp.get('cuerpo', '')) < 200 or
                not metadata.get('skills')
            )
        )
        if needs_enrichment:
            to_enrich.append(opp)

    print(f'✅ {len(to_enrich)} opportunities need enrichment')
    return to_enrich


def enrich_with_gemini(opportunity):
    """
    Usa Gemini 1.5 Flash para enriquecer una oportunidad.
    """
    titulo = opportunity.get('titulo', '')
    cuerpo = opportunity.get('cuerpo', '')
    ubicacion = opportunity.get('ubicacion', '')
    categoria = opportunity.get('categoria', '')

    prompt = f"""Sos un asistente especializado en análisis de ofertas laborales.

Analizá esta oportunidad y completá los datos faltantes:

**Título:** {titulo}
**Categoría:** {categoria}
**Ubicación:** {ubicacion}
**Descripción:** {cuerpo[:1000]}

Tu tarea:
1. Extraé todas las skills técnicas y blandas mencionadas (mínimo 3, máximo 10)
2. Normalizá la ubicación a formato "Ciudad, País" (ej: "Asunción, Paraguay")
3. Identificá la empresa/organización si está mencionada en el texto
4. Si la descripción es <100 palabras, expand íla agregando contexto relevante basado en el título y categoría

Respondé SOLO con JSON válido (sin markdown):
{{
  "skills": ["skill1", "skill2", ...],
  "ubicacion_normalizada": "Ciudad, País",
  "organization": "Nombre de la empresa" o null si no identificaste,
  "descripcion_expandida": "descripción mejorada" o null si ya era suficiente
}}"""

    try:
        response = requests.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}',
            json={
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {
                    'temperature': 0.3,
                    'maxOutputTokens': 800,
                },
            },
            timeout=15
        )

        if not response.ok:
            print(f'  ❌ Gemini error {response.status_code}')
            return None

        data = response.json()
        text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')

        # Limpiar markdown si viene con ```json
        clean_text = text.replace('```json', '').replace('```', '').strip()
        enriched = json.loads(clean_text)

        return enriched

    except Exception as e:
        print(f'  ❌ Error enriching: {e}')
        return None


def update_opportunity(opp_id, enriched_data):
    """
    Actualiza una oportunidad con los datos enriquecidos.
    """
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }

    # Preparar metadata actualizada
    metadata = {
        'enriched': True,
        'enriched_at': datetime.now().isoformat(),
        'skills': enriched_data.get('skills', []),
    }

    if enriched_data.get('organization'):
        metadata['organization'] = enriched_data['organization']

    update_payload = {'metadata': metadata}

    # Actualizar ubicación si se normalizó
    if enriched_data.get('ubicacion_normalizada'):
        update_payload['ubicacion'] = enriched_data['ubicacion_normalizada']

    # Actualizar descripción si se expandió
    if enriched_data.get('descripcion_expandida'):
        update_payload['cuerpo'] = enriched_data['descripcion_expandida']

    response = requests.patch(
        f'{SUPABASE_URL}/rest/v1/content_hub?id=eq.{opp_id}',
        headers=headers,
        json=update_payload
    )

    return response.ok


def main():
    if not all([SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY]):
        print('❌ Missing environment variables')
        sys.exit(1)

    print('🚀 Starting opportunity enrichment...')
    print(f'   Limit: {LIMIT} opportunities')
    print()

    opportunities = fetch_opportunities_to_enrich()

    if not opportunities:
        print('✅ No opportunities to enrich')
        return

    enriched_count = 0
    failed_count = 0

    for i, opp in enumerate(opportunities, 1):
        print(f'[{i}/{len(opportunities)}] {opp["titulo"][:50]}...')

        enriched = enrich_with_gemini(opp)

        if enriched:
            success = update_opportunity(opp['id'], enriched)
            if success:
                print(f'  ✅ Enriched: {len(enriched.get("skills", []))} skills, org: {enriched.get("organization", "N/A")}')
                enriched_count += 1
            else:
                print(f'  ❌ Failed to update')
                failed_count += 1
        else:
            failed_count += 1

    print()
    print(f'📊 Results: {enriched_count} enriched, {failed_count} failed')


if __name__ == '__main__':
    main()
