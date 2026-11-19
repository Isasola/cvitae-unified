"""
Quality Gate: Evalúa automáticamente si una oportunidad es "rich" o necesita revisión manual.

Criterios:
- Descripción: >300 palabras = 40 pts, >150 = 20 pts, >50 = 10 pts
- Ubicación clara: 20 pts
- Empresa identificada: 20 pts
- Skills listados: 20 pts

Score >= 70: Aprobado automáticamente
Score < 70: Va a revisión manual en Admin
"""

def evaluate_quality(opportunity: dict) -> dict:
    """
    Evalúa la calidad de una oportunidad según criterios definidos.

    Args:
        opportunity: Dict con campos como description, ubicacion, organization, skills

    Returns:
        Dict con approved (bool), score (int), reasons (list), gates (dict)
    """
    gates = {
        'has_description': False,
        'description_length': 0,
        'has_location': False,
        'has_organization': False,
        'has_skills': False,
    }

    reasons = []
    score = 0

    # Gate 1: Descripción existente y >300 palabras
    description = opportunity.get('description') or opportunity.get('cuerpo') or ''
    word_count = len(description.strip().split())
    gates['description_length'] = word_count
    gates['has_description'] = word_count > 50

    if word_count >= 300:
        score += 40
    elif word_count >= 150:
        score += 20
        reasons.append(f'Descripción corta ({word_count} palabras, ideal: 300+)')
    elif word_count >= 50:
        score += 10
        reasons.append(f'Descripción muy corta ({word_count} palabras, ideal: 300+)')
    else:
        reasons.append(f'Descripción insuficiente ({word_count} palabras, mínimo: 50)')

    # Gate 2: Ubicación clara
    location = opportunity.get('ubicacion') or opportunity.get('location') or ''
    gates['has_location'] = len(location) > 5 and 'remot' not in location.lower()

    if gates['has_location']:
        score += 20
    elif len(location) > 0:
        score += 10
        reasons.append('Ubicación no clara o remoto sin especificar país')
    else:
        reasons.append('Sin ubicación especificada')

    # Gate 3: Organización/Empresa identificada
    organization = opportunity.get('organization') or opportunity.get('empresa') or opportunity.get('company') or ''
    gates['has_organization'] = (
        len(organization) > 2 and
        'confidencial' not in organization.lower() and
        organization.lower() not in ['empresa', 'company', 'compañía']
    )

    if gates['has_organization']:
        score += 20
    else:
        reasons.append('Empresa no identificada claramente')

    # Gate 4: Skills o requisitos listados
    has_skills_array = isinstance(opportunity.get('skills'), list) and len(opportunity.get('skills', [])) > 0
    requirements = opportunity.get('requirements') or ''
    has_requirements = len(requirements) > 50
    gates['has_skills'] = has_skills_array or has_requirements

    if gates['has_skills']:
        score += 20
    else:
        reasons.append('Sin skills o requisitos especificados')

    # Aprobar automáticamente si score >= 70
    approved = score >= 70

    return {
        'approved': approved,
        'score': score,
        'reasons': reasons,
        'gates': gates,
    }


def add_quality_metadata(opportunity: dict) -> dict:
    """
    Agrega metadatos de calidad a una oportunidad antes de insertarla en la BD.
    Modifica el dict in-place y lo retorna.
    """
    result = evaluate_quality(opportunity)

    # Agregar campos de calidad
    opportunity['quality_status'] = 'approved' if result['approved'] else 'pending_review'
    opportunity['quality_score'] = result['score']
    opportunity['quality_reasons'] = result['reasons']

    # Si está aprobada automáticamente, marcarla como activa
    # Si no, dejarla inactiva hasta revisión manual
    if result['approved']:
        opportunity['is_active'] = True
    else:
        opportunity['is_active'] = False

    return opportunity


# Ejemplo de uso en un scraper:
if __name__ == '__main__':
    # Test case 1: Oportunidad "rich" que debería aprobarse
    rich_opp = {
        'titulo': 'Senior Python Developer',
        'description': ' '.join(['Buscamos desarrollador Python senior con experiencia en APIs REST, microservicios y cloud.'] * 50),  # >300 palabras
        'ubicacion': 'Asunción, Paraguay',
        'organization': 'Tech Company SA',
        'skills': ['Python', 'Django', 'AWS', 'Docker'],
    }

    result = evaluate_quality(rich_opp)
    print('Test 1 - Oportunidad RICH:')
    print(f'  Aprobada: {result["approved"]}')
    print(f'  Score: {result["score"]}/100')
    print(f'  Razones: {result["reasons"]}')
    print()

    # Test case 2: Oportunidad pobre que necesita revisión
    poor_opp = {
        'titulo': 'Trabajo disponible',
        'description': 'Empresa busca personal.',
        'ubicacion': 'Remoto',
        'organization': 'Empresa Confidencial',
    }

    result2 = evaluate_quality(poor_opp)
    print('Test 2 - Oportunidad POBRE:')
    print(f'  Aprobada: {result2["approved"]}')
    print(f'  Score: {result2["score"]}/100')
    print(f'  Razones: {result2["reasons"]}')
