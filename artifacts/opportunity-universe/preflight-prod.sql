-- PURE READ ONLY. One result row / one JSON object. Evaluates every current opportunity; no migration objects required.
with
identity_map(emitted_source,canonical_source) as (values
('500_latam','500_latam'),
('abc','abc'),
('abc_color','abc'),
('abc_scrapper','abc'),
('aecid_paraguay_calls','aecid_paraguay_calls'),
('agroindustria','agroindustria'),
('agroindustria_py','agroindustria'),
('aptitus','aptitus'),
('aptitus_pe','aptitus'),
('arbeitnow','arbeitnow'),
('automotriz','automotriz'),
('automotriz_py','automotriz'),
('bancos','bancos'),
('becal','becal'),
('becas_gobierno_itaipu','becas_gobierno_itaipu'),
('bolsas_locales','bolsas_locales'),
('bolsas_locales_py','bolsas_locales'),
('bumeran','bumeran'),
('bumeran_pe','bumeran'),
('buscojobs','buscojobs'),
('caf_calls','caf_calls'),
('callcenters','callcenters'),
('cc_atento','callcenters'),
('cde_frontera','cde_frontera'),
('cde_frontera_py','cde_frontera'),
('chevening','chevening'),
('cird_competitions_tenders','cird_competitions_tenders'),
('clasipar','scrapper'),
('coimbra_group','coimbra_group'),
('computrabajo','computrabajo'),
('computrabajo_pe','computrabajo'),
('conacyt_convocatorias','conacyt_convocatorias'),
('constructoras','constructoras'),
('cooperativas','cooperativas'),
('copaco','copaco'),
('daad','daad'),
('developmentaid','developmentaid'),
('devex','devex'),
('eby_yacyreta','eby_yacyreta'),
('empleapy_mtess','empleapy_mtess'),
('energia_utilities','energia_utilities'),
('energia_utilities_py','energia_utilities'),
('erasmus_mundus','erasmus_mundus'),
('eu_delegation_paraguay','eu_delegation_paraguay'),
('eu_lac_accelerator','eu_lac_accelerator'),
('f6s_latam','f6s_latam'),
('farmacias','farmacias'),
('farmacias_py','farmacias'),
('fcq_una_job_board','fcq_una_job_board'),
('fiuna_job_board','fiuna_job_board'),
('foroparaguay','foros'),
('foros','foros'),
('frigorificos','frigorificos'),
('frigorificos_py','frigorificos'),
('fundacion','fundacion'),
('fundacion_carolina','fundacion_carolina'),
('fundacionparaguaya','fundacion'),
('gastronomia_hoteles','gastronomia_hoteles'),
('gastronomia_hoteles_py','gastronomia_hoteles'),
('globaljobs','globaljobs'),
('google_startups_latam','google_startups_latam'),
('googlejobs','googlejobs_v2'),
('googlejobs_v2','googlejobs_v2'),
('googlejobs_v3','googlejobs_v3'),
('grupo_cartes','grupocarteshs'),
('grupo_vierci','grupovierci'),
('grupocarteshs','grupocarteshs'),
('grupovierci','grupovierci'),
('himalayas','himalayas'),
('hireon','hireon'),
('hospitales','hospitales'),
('idb_calls','idb_calls'),
('idealist','idealist'),
('impactpool','impactpool'),
('indeed','indeed'),
('indeed_pe','indeed'),
('industria_manufactura','industria_manufactura'),
('industria_manufactura_py','industria_manufactura'),
('innovandopy_startups','innovandopy_startups'),
('ipa_convocatorias','ipa_convocatorias'),
('itau','itau'),
('jobicy','jobicy'),
('jooble','jooble'),
('jooble_pe','jooble'),
('laborum','laborum'),
('laborum_pe','laborum'),
('logistica_transporte','logistica_transporte'),
('logistica_transporte_py','logistica_transporte'),
('medios_comunicacion','medios_comunicacion'),
('medios_py','medios_comunicacion'),
('mef_inapp_becas','mef_inapp_becas'),
('merienderos','merienderos'),
('mic_portal_emprendedor','mic_portal_emprendedor'),
('ministerios','ministerios'),
('mit_solve','mit_solve'),
('mitic_opportunities','mitic_opportunities'),
('mtess','empleapy_mtess'),
('oas_scholarships','oas_scholarships'),
('ofertaslaborales','ofertaslaborales'),
('one_young_world_scholarships','one_young_world_scholarships'),
('ong_bid_py','ongs'),
('ong_giz_py','ongs'),
('ong_oas_py','ongs'),
('ongs','ongs'),
('opportunitydesk','opportunitydesk'),
('oya','oya'),
('oyaop','oya'),
('personal','personal'),
('pivot_jobs','pivot_jobs'),
('pro_ong_conevio','pro_ong_conevio'),
('puertos_importadoras','puertos_importadoras'),
('puertos_importadoras_py','puertos_importadoras'),
('reddit','reddit'),
('reddit_py','reddit'),
('reddit_py_trabajo','reddit'),
('reemujerpy_mipymes','reemujerpy_mipymes'),
('reliefweb','reliefweb'),
('remotive','remotive'),
('retail_malls','retail_malls'),
('retail_malls_py','retail_malls'),
('santander_open_academy','santander_open_academy'),
('scholarship_corner','scholarship_corner'),
('scrapper','scrapper'),
('seguros','seguros'),
('seguros_unimedica','seguros'),
('sicca','sicca'),
('snj_paraguay','snj_paraguay'),
('startup_chile','startup_chile'),
('supermercados','supermercados'),
('talent','talentcom'),
('talent.com','talentcom'),
('talentcom','talentcom'),
('tech_local','tech_local'),
('telecomunicaciones','telecomunicaciones'),
('telecomunicaciones_py','telecomunicaciones'),
('tigo','tigo'),
('ucom_job_board','ucom_job_board'),
('un-jobs','unjobs'),
('universidades','universidades'),
('unjobs','unjobs'),
('us_embassy_paraguay','us_embassy_paraguay'),
('vc4a_pes_latam','vc4a_pes_latam'),
('we-work-remotely','weworkremotely'),
('weworkremotely','weworkremotely'),
('workday_multinacionales','workday_multinacionales'),
('wwf_paraguay_calls','wwf_paraguay_calls'),
('wwr','weworkremotely'),
('zonajobs_py','foros')
),
permission_sources(canonical_source) as (values
('unjobs'),
('himalayas'),
('talentcom'),
('weworkremotely'),
('empleapy_mtess'),
('mef_inapp_becas'),
('conacyt_convocatorias'),
('mitic_opportunities'),
('innovandopy_startups'),
('mic_portal_emprendedor'),
('reemujerpy_mipymes'),
('snj_paraguay'),
('ipa_convocatorias'),
('aecid_paraguay_calls'),
('us_embassy_paraguay'),
('eu_delegation_paraguay'),
('becas_gobierno_itaipu'),
('eby_yacyreta'),
('wwf_paraguay_calls'),
('cird_competitions_tenders'),
('pro_ong_conevio'),
('fiuna_job_board'),
('ucom_job_board'),
('fcq_una_job_board'),
('chevening'),
('erasmus_mundus'),
('oas_scholarships'),
('daad'),
('coimbra_group'),
('santander_open_academy'),
('one_young_world_scholarships'),
('500_latam'),
('google_startups_latam'),
('startup_chile'),
('idb_calls'),
('caf_calls'),
('mit_solve'),
('eu_lac_accelerator'),
('f6s_latam'),
('devex'),
('developmentaid'),
('impactpool'),
('globaljobs'),
('vc4a_pes_latam'),
('computrabajo'),
('buscojobs'),
('scrapper'),
('abc'),
('fundacion'),
('remotive'),
('oya'),
('opportunitydesk'),
('becal'),
('fundacion_carolina'),
('arbeitnow'),
('jobicy'),
('sicca'),
('ministerios'),
('bancos'),
('cooperativas'),
('seguros'),
('callcenters'),
('universidades'),
('constructoras'),
('grupovierci'),
('grupocarteshs'),
('hospitales'),
('supermercados'),
('ongs'),
('tech_local'),
('foros'),
('jooble'),
('googlejobs_v2'),
('googlejobs_v3'),
('automotriz'),
('farmacias'),
('gastronomia_hoteles'),
('agroindustria'),
('frigorificos'),
('industria_manufactura'),
('telecomunicaciones'),
('medios_comunicacion'),
('retail_malls'),
('logistica_transporte'),
('energia_utilities'),
('puertos_importadoras'),
('cde_frontera'),
('workday_multinacionales'),
('bolsas_locales'),
('aptitus'),
('bumeran'),
('indeed'),
('laborum'),
('reddit'),
('copaco'),
('hireon'),
('idealist'),
('itau'),
('merienderos'),
('ofertaslaborales'),
('personal'),
('pivot_jobs'),
('reliefweb'),
('scholarship_corner'),
('tigo')
),
permission_dimensions(dimension) as (values
('collect'),
('detail_fetch'),
('catalog'),
('matching'),
('alerts'),
('seo_index'),
('google_jobs'),
('third_party_distribution'),
('application_routing'),
('attribution_requirement')
),
permission_overrides(canonical_source,dimension,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes) as (values
('himalayas','collect','ALLOWED','PUBLIC_API_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Free public API requires no key/authentication and expressly supports job search products, dashboards, AI agents, and automation.'),
('himalayas','detail_fetch','ALLOWED','PUBLIC_API_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','The official API provides job detail fields, including full descriptions and application links; use the API payload and preserve source identity.'),
('himalayas','catalog','ALLOWED','FIRST_PARTY_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation allows listings to power job-search products and dashboards; Himalayas must remain the original source with linkback.'),
('himalayas','matching','ALLOWED','JOB_SEARCH_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation expressly permits job-search products, dashboards, AI agents, and automation; third-party republication remains separately prohibited.'),
('himalayas','alerts','ALLOWED','JOB_SEARCH_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Alerts are first-party job-search product use; preserve visible Himalayas attribution and the original listing link.'),
('himalayas','seo_index','ALLOWED','FIRST_PARTY_ORGANIC_INDEXING','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','First-party CVitae organic indexing is within permitted job-search product use; this does not permit Google Jobs or other third-party submission.'),
('himalayas','google_jobs','DENIED','THIRD_PARTY_JOB_AGGREGATOR_PROHIBITED','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation prohibits submitting Himalayas listings to third-party sites, explicitly including Google Jobs.'),
('himalayas','third_party_distribution','DENIED','THIRD_PARTY_JOB_AGGREGATOR_PROHIBITED','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation prohibits submission to third-party sites including Jooble, Neuvoo, Google Jobs, and LinkedIn Jobs.'),
('himalayas','application_routing','ALLOWED','PRESERVE_ORIGINAL_HIMALAYAS_LINK','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Keep and expose the original Himalayas listing/application link as the source destination.'),
('himalayas','attribution_requirement','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Visible Himalayas attribution and linkback to the original listing are mandatory conditions.'),
('weworkremotely','collect','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms expressly prohibit using API or any WWR data to build a job advertising or job search service; no separate official RSS grant for CVitae use was evidenced.'),
('weworkremotely','detail_fetch','DENIED','DETAIL_HTML_NOT_COVERED_BY_RSS_PERMISSION','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Feed permission does not authorize detail-page scraping/storage; obtain written permission before use.'),
('weworkremotely','catalog','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms prohibit using API or WWR data to build a job advertising or job search service.'),
('weworkremotely','matching','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Candidate-facing opportunity matching is part of a job search service; exact CVitae use requires publisher confirmation.'),
('weworkremotely','alerts','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Job alert distribution from WWR data would serve the prohibited job search service.'),
('weworkremotely','seo_index','DENIED','JOB_SEARCH_DESTINATION_REPLICATION_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms prohibit using the data for a destination/search service for WWR job content.'),
('weworkremotely','application_routing','ALLOWED','APPLICATION_MUST_ROUTE_TO_WWR','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms require application to route through weworkremotely.com; this is a routing condition, not reuse permission.'),
('weworkremotely','attribution_requirement','ALLOWED','APPLICATION_ROUTING_CONDITION','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms specify the source interface must not be bypassed for applications; no broader distribution permission inferred.'),
('impactpool','collect','UNKNOWN','ACQUISITION_METHOD_PERMISSION_UNRESOLVED','https://www.impactpool.org/signup/terms; docs/source-permission-matrix.md#Impactpool','OFFICIAL_TERMS_AND_REPOSITORY_SOURCE_PROFILE','https://www.impactpool.org/signup/terms; docs/source-permission-matrix.md#Impactpool',DATE '2026-09-29','Terms prohibit unauthorized scraping/extraction, but repository describes API/listing acquisition and does not establish whether the current method is covered by a license.'),
('impactpool','detail_fetch','UNKNOWN','DETAIL_FETCH_PERMISSION_NOT_EVIDENCED','docs/source-permission-matrix.md#Impactpool','REPOSITORY_SOURCE_PROFILE','docs/source-permission-matrix.md#Impactpool',DATE '2026-09-29','No affirmative detail-fetch method/license is documented.'),
('impactpool','catalog','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Reproduction/distribution requires permission.'),
('impactpool','matching','UNKNOWN','MATCHING_USE_NOT_EVIDENCED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Terms restrict scraping and public reproduction; they do not expressly resolve internal matching use for the observed acquisition method.'),
('impactpool','alerts','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Use of extracted platform content for alerts is not licensed by repo evidence.'),
('impactpool','seo_index','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Public redistribution/indexing is not licensed by repo evidence.'),
('impactpool','google_jobs','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Third-party distribution is not licensed by repo evidence.'),
('impactpool','third_party_distribution','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Third-party distribution is not licensed by repo evidence.'),
('computrabajo','collect','DENIED','AUTOMATED_ACCESS_PROHIBITED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The official Paraguay notice prohibits access or reading through robots/automated programs and expressly prohibits Robot/Crawler copying.'),
('computrabajo','detail_fetch','DENIED','AUTOMATED_ACCESS_PROHIBITED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The official Paraguay notice prohibits software/scripts and automated reading/copying of site content.'),
('computrabajo','catalog','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Reproduction and distribution of site content requires authorization; automated copying is expressly prohibited.'),
('computrabajo','matching','UNKNOWN','MATCHING_PERMISSION_NOT_EXPLICITLY_ADDRESSED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE_REVIEW','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The reviewed terms do not establish permission for internal or candidate-facing matching; no authorization is inferred.'),
('computrabajo','alerts','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Alerts reproduce/distribute site content; the official notice requires authorization and prohibits automated copying.'),
('computrabajo','seo_index','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Indexing copied listing content would reproduce/distribute content without the authorization required by the official notice.'),
('computrabajo','google_jobs','DENIED','THIRD_PARTY_DISTRIBUTION_NOT_AUTHORIZED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Third-party listing distribution requires authorization; no Google Jobs authorization is evidenced.'),
('computrabajo','third_party_distribution','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The official notice requires authorization for reproduction/distribution of content.'),
('computrabajo','application_routing','UNKNOWN','APPLICATION_ROUTING_NOT_EVIDENCED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE_REVIEW','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The reviewed notice does not establish a CVitae application-routing permission or condition.'),
('computrabajo','attribution_requirement','UNKNOWN','ATTRIBUTION_REQUIREMENT_NOT_EVIDENCED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE_REVIEW','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','No attribution or linkback requirement was established by the reviewed notice; permission is not inferred.'),
('remotive','collect','ALLOWED','PUBLIC_API_USE_DOCUMENTED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Public API use is permitted subject to attribution, linkback, and the terms.'),
('remotive','detail_fetch','NOT_APPLICABLE','API_RECORD_HAS_NO_SEPARATE_DETAIL_FETCH','https://remotive.com/remote-jobs/api','OFFICIAL_API_CONTRACT','https://remotive.com/remote-jobs/api',DATE '2026-09-29','The consumed API record is the detail payload; no separate detail fetch is used.'),
('remotive','catalog','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Permitted only with source attribution and linkback; not gated for signups.'),
('remotive','matching','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Permitted only with source attribution and linkback.'),
('remotive','alerts','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Permitted only with source attribution and linkback.'),
('remotive','google_jobs','DENIED','THIRD_PARTY_JOB_PLATFORM_RESTRICTED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Terms prohibit submission to third-party job platforms including Google Jobs.'),
('remotive','third_party_distribution','DENIED','THIRD_PARTY_JOB_PLATFORM_RESTRICTED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Terms prohibit redistribution to third-party job platforms.'),
('remotive','application_routing','ALLOWED','SOURCE_APPLICATION_LINK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Route to the source application URL; preserve the source link.'),
('remotive','attribution_requirement','ALLOWED','ATTRIBUTION_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Attribution and linkback are mandatory conditions.'),
('fundacion_carolina','collect','DENIED','EXTRACTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Extraction/reuse is reserved absent legal basis or written authorization.'),
('fundacion_carolina','detail_fetch','DENIED','EXTRACTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','No detail extraction permission is evidenced.'),
('fundacion_carolina','catalog','DENIED','REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Reproduction/distribution requires authorization.'),
('fundacion_carolina','matching','DENIED','REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Use of extracted content is not authorized by repository evidence.'),
('fundacion_carolina','alerts','DENIED','REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Use of extracted content is not authorized by repository evidence.'),
('fundacion_carolina','seo_index','DENIED','REUSE_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Public reuse/indexing is not authorized absent permission.'),
('fundacion_carolina','google_jobs','DENIED','REUSE_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Third-party distribution is not authorized absent permission.'),
('fundacion_carolina','third_party_distribution','DENIED','REUSE_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Third-party distribution is not authorized absent permission.'),
('arbeitnow','collect','ALLOWED','API_USE_WITH_LINKBACK','https://www.arbeitnow.com/terms','OFFICIAL_TERMS','https://www.arbeitnow.com/terms',DATE '2026-09-29','Official terms permit API data use with required linkback; this is limited to the documented API.'),
('arbeitnow','attribution_requirement','ALLOWED','LINKBACK_REQUIRED','https://www.arbeitnow.com/terms','OFFICIAL_TERMS','https://www.arbeitnow.com/terms',DATE '2026-09-29','Linkback is a required condition for API use.'),
('jobicy','collect','ALLOWED','PUBLIC_API_PRODUCT_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Official API documentation (updated 2026-09-16) permits normal API integrations in own products without individual approval; polling must not exceed once per hour.'),
('jobicy','detail_fetch','NOT_APPLICABLE','API_RECORD_HAS_NO_SEPARATE_DETAIL_FETCH','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_CONTRACT','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Current local acquisition uses API records; official guidance says preserve canonical Jobicy URL and attribution.'),
('jobicy','catalog','ALLOWED','OWN_PRODUCT_LISTING_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Documentation expressly covers job boards and user-facing products; preserve Jobicy as original source and canonical URL.'),
('jobicy','matching','ALLOWED','OWN_PRODUCT_LISTING_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Career tools and AI assistants are named normal integrations; preserve attribution and source URL.'),
('jobicy','alerts','ALLOWED','OWN_PRODUCT_LISTING_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Newsletters are expressly named; alert emails must preserve source attribution and canonical listing URL.'),
('jobicy','application_routing','ALLOWED','CANONICAL_SOURCE_URL_REQUIRED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Preserve and route through the canonical Jobicy job URL; direct ATS URLs require the documented access mode.'),
('jobicy','attribution_requirement','ALLOWED','SOURCE_ATTRIBUTION_REQUIRED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Listings must not be presented as original CVitae postings; retain attribution and canonical Jobicy URL.')
),
permission_evidence as (
  select s.canonical_source,d.dimension,coalesce(o.permission_state,'UNKNOWN') permission_state,
    coalesce(o.reason,'SOURCE_PERMISSION_NOT_EVIDENCED') reason,
    coalesce(o.provenance,'docs/source-permission-matrix.md; no affirmative permission evidence identified') provenance,
    coalesce(o.evidence_type,'REPOSITORY_REVIEW') evidence_type,
    coalesce(o.evidence_reference,'docs/source-permission-matrix.md') evidence_reference,
    coalesce(o.verified_at,DATE '2026-09-29') verified_at,
    coalesce(o.notes,'No evidence for '||d.dimension||' on '||s.canonical_source||'; UNKNOWN is not DENIED and is not permission.') notes
  from permission_sources s cross join permission_dimensions d
  left join permission_overrides o using(canonical_source,dimension)
),
permission_pivot as (
  select canonical_source,
    max(permission_state) filter(where dimension='matching') as matching_permission,
    max(permission_state) filter(where dimension='catalog') as catalog_permission,
    max(permission_state) filter(where dimension='alerts') as alerts_permission,
    max(permission_state) filter(where dimension='seo_index') as seo_permission,
    max(reason) filter(where dimension='matching') as matching_reason,
    max(provenance) filter(where dimension='matching') as matching_provenance,
    bool_or(permission_state='UNKNOWN') any_permission_unknown,
    sum((permission_state='UNKNOWN')::int) unknown_permission_dimensions
  from permission_evidence group by canonical_source
),
source_policy_rows as (
  select coalesce(i.canonical_source,lower(trim(s.source))) canonical_source,s.*
  from public.opportunity_sources s left join identity_map i on i.emitted_source=lower(trim(s.source))
),
source_policy as (
  select canonical_source,count(*) row_count,
    count(*) filter(where is_enabled is null) enabled_nulls,count(distinct is_enabled) enabled_values,
    case when count(*) filter(where is_enabled is null)>0 or count(distinct is_enabled)<>1 then null else bool_and(is_enabled) end is_enabled,
    count(*) filter(where matching_enabled is null) matching_nulls,count(distinct matching_enabled) matching_values,
    case when count(*) filter(where matching_enabled is null)>0 or count(distinct matching_enabled)<>1 then null else bool_and(matching_enabled) end matching_enabled,
    count(*) filter(where catalog_enabled is null) catalog_nulls,count(distinct catalog_enabled) catalog_values,
    count(*) filter(where alerts_enabled is null) alerts_nulls,count(distinct alerts_enabled) alerts_values,
    count(*) filter(where seo_enabled is null) seo_nulls,count(distinct seo_enabled) seo_values,
    count(distinct coalesce(is_enabled::text,'UNKNOWN'))>1 global_alias_conflict,
    count(distinct coalesce(matching_enabled::text,'UNKNOWN'))>1 matching_alias_conflict,
    count(distinct coalesce(catalog_enabled::text,'UNKNOWN'))>1 catalog_alias_conflict,
    count(distinct coalesce(alerts_enabled::text,'UNKNOWN'))>1 alerts_alias_conflict,
    count(distinct coalesce(seo_enabled::text,'UNKNOWN'))>1 seo_alias_conflict,
    case when count(*) filter(where catalog_enabled is null)>0 or count(distinct catalog_enabled)<>1 then null else bool_and(catalog_enabled) end catalog_enabled,
    case when count(*) filter(where alerts_enabled is null)>0 or count(distinct alerts_enabled)<>1 then null else bool_and(alerts_enabled) end alerts_enabled,
    case when count(*) filter(where seo_enabled is null)>0 or count(distinct seo_enabled)<>1 then null else bool_and(seo_enabled) end seo_enabled,
    (count(distinct coalesce(is_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(matching_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(catalog_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(alerts_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(seo_enabled::text,'UNKNOWN'))>1) policy_alias_conflict,
    jsonb_agg(lower(source) order by lower(source)) policy_rows
  from source_policy_rows group by canonical_source
),
latest_observation as (
  select distinct on (opportunity_id::text) opportunity_id::text opportunity_id,id,source,identity_status,http_status,observed_at
  from public.opportunity_source_observations order by opportunity_id::text,observed_at desc,id desc
),
inventory as (
  select o.*,coalesce(i.canonical_source,lower(trim(o.source))) canonical_source,
    case jsonb_typeof(to_jsonb(o)->'requirements')
      when 'string' then trim(coalesce(to_jsonb(o)->'requirements' #>> '{}',''))
      when 'array' then coalesce((select string_agg(trim(req.text_value),' ' order by req.ordinality) from (
        select case jsonb_typeof(item.value) when 'string' then item.value #>> '{}'
          when 'object' then case when jsonb_typeof(item.value->'text')='string' then item.value->>'text' else null end
          else null end text_value,item.ordinality
        from jsonb_array_elements(to_jsonb(o)->'requirements') with ordinality as item(value,ordinality)
      ) req where nullif(trim(req.text_value),'') is not null),'')
      else '' end universe_requirements_text,to_jsonb(o)->>'professional_family' universe_professional_family_value,
    lo.id observation_id,lo.source observation_source,coalesce(oi.canonical_source,lower(trim(lo.source))) observation_canonical_source,lo.identity_status observation_status,lo.http_status observation_http_status,lo.observed_at observation_at,
    pp.matching_permission,pp.catalog_permission,pp.alerts_permission,pp.seo_permission,pp.matching_reason,pp.matching_provenance,
    sp.row_count policy_row_count,sp.enabled_nulls,sp.enabled_values,sp.is_enabled,sp.matching_nulls,sp.matching_values,sp.matching_enabled,
    sp.catalog_enabled,sp.catalog_nulls,sp.catalog_values,sp.alerts_enabled,sp.alerts_nulls,sp.alerts_values,sp.seo_enabled,sp.seo_nulls,sp.seo_values,sp.global_alias_conflict,sp.matching_alias_conflict,sp.catalog_alias_conflict,sp.alerts_alias_conflict,sp.seo_alias_conflict,sp.policy_alias_conflict,sp.policy_rows,coalesce(pp.any_permission_unknown,true) any_permission_unknown,coalesce(pp.unknown_permission_dimensions,10) unknown_permission_dimensions,
    case when nullif(trim(o.deadline),'') is null then 'UNKNOWN'
      when trim(o.deadline) ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(trim(o.deadline),'date') then case when trim(o.deadline)::date < current_date then 'EXPIRED' else 'OPEN' end
      when trim(o.deadline) ~ '(Z|[+-]\d\d:\d\d)$' and pg_input_is_valid(trim(o.deadline),'timestamptz') then case when trim(o.deadline)::timestamptz < now() then 'EXPIRED' else 'OPEN' end
      else 'INVALID' end deadline_state
  from public.opportunities o
  left join identity_map i on i.emitted_source=lower(trim(o.source))
  left join latest_observation lo on lo.opportunity_id=o.id::text
  left join identity_map oi on oi.emitted_source=lower(trim(lo.source))
  left join permission_pivot pp on pp.canonical_source=coalesce(i.canonical_source,lower(trim(o.source)))
  left join source_policy sp on sp.canonical_source=coalesce(i.canonical_source,lower(trim(o.source)))
),
classified as (
  select x.*,
    case when nullif(x.deleted_at::text,'') is not null then 'DELETED'
      when nullif(x.archived_at::text,'') is not null then 'ARCHIVED'
      when x.deadline_state='EXPIRED' then 'EXPIRED'
      when x.deadline_state='INVALID' then 'LIFECYCLE_UNKNOWN'
      when x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status in ('DEAD','REMOVED') and x.observation_http_status in (404,410) then 'HARD_DEAD'
      when x.is_active is not true and x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status='IDENTITY_CONFIRMED' and x.observation_http_status=200 then 'STALE_DERIVED_STATE'
      when x.is_active is true and x.verification_status='verified' then 'ACTIVE_VALID'
      when x.is_active is false and x.verification_status in ('rejected','quarantined') then 'INACTIVE_VALID'
      else 'LIFECYCLE_UNKNOWN' end lifecycle_state,
    case when nullif(x.deleted_at::text,'') is not null then 'ROW_DELETED'
      when nullif(x.archived_at::text,'') is not null then 'ROW_ARCHIVED'
      when x.deadline_state='EXPIRED' then 'DEADLINE_EXPIRED'
      when x.deadline_state='INVALID' then 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN'
      when x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status in ('DEAD','REMOVED') and x.observation_http_status in (404,410) then 'LATEST_HARD_DEAD_OBSERVATION'
      when x.is_active is not true and x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status='IDENTITY_CONFIRMED' and x.observation_http_status=200 then case when x.is_active is false then 'LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' else 'LATEST_LIVE_OBSERVATION_RESOLVES_UNKNOWN_ACTIVE' end
      when x.is_active is true and x.verification_status='verified' then case when x.deadline_state='UNKNOWN' then 'ACTIVE_VERIFIED_NO_DEADLINE' else 'ACTIVE_VERIFIED_DEADLINE_OPEN' end
      when x.is_active is false and x.verification_status in ('rejected','quarantined') then 'VERIFICATION_'||upper(x.verification_status)
      else 'INSUFFICIENT_LIFECYCLE_EVIDENCE' end lifecycle_reason,
    case when nullif(trim(coalesce(x.title,'')),'')='' then 'MISSING_TITLE'
      when nullif(trim(coalesce(x.slug,'')),'') is null then 'MISSING_CANONICAL_IDENTITY'
      when length(trim(coalesce(x.description,'')))<100 then 'THIN_CONTENT'
      when nullif(trim(coalesce(x.organization,'')),'') is null then 'MISSING_ORGANIZATION'
      else 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' end seo_content_reason,
    case when nullif(trim(coalesce(x.title,'')),'')<>'' and cardinality(regexp_split_to_array(trim(x.title),'\s+'))>=2 and (length(trim(coalesce(x.description,'')))>=100 or length(trim(coalesce(x.universe_requirements_text,'')))>=60 or nullif(trim(coalesce(x.universe_professional_family_value,'')),'') is not null) then true else false end professional_fact,
    case when x.global_alias_conflict then 'CONFLICT' when x.enabled_nulls is null or x.enabled_nulls>0 or x.enabled_values<>1 then 'UNKNOWN' when x.is_enabled then 'ALLOWED' else 'DENIED' end source_operation_state,
    case when x.global_alias_conflict or x.matching_alias_conflict or x.matching_nulls is null or x.matching_nulls>0 or x.matching_values<>1 then 'UNKNOWN' when x.matching_enabled then 'ALLOWED' else 'DENIED' end matching_switch_state,
    case when x.global_alias_conflict or x.catalog_alias_conflict or x.catalog_nulls is null or x.catalog_nulls>0 or x.catalog_values<>1 then 'UNKNOWN' when x.catalog_enabled then 'ALLOWED' else 'DENIED' end catalog_switch_state,
    case when x.global_alias_conflict or x.alerts_alias_conflict or x.alerts_nulls is null or x.alerts_nulls>0 or x.alerts_values<>1 then 'UNKNOWN' when x.alerts_enabled then 'ALLOWED' else 'DENIED' end alerts_switch_state,
    case when x.global_alias_conflict or x.seo_alias_conflict or x.seo_nulls is null or x.seo_nulls>0 or x.seo_values<>1 then 'UNKNOWN' when x.seo_enabled then 'ALLOWED' else 'DENIED' end seo_switch_state
  from inventory x
),
decisions as (
  select c.*,
    case when c.lifecycle_state<>'ACTIVE_VALID' then 'PROFESSIONAL_UNKNOWN' when c.professional_fact then 'PROFESSIONAL_READY' else 'PROFESSIONAL_THIN' end professional_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when c.professional_fact then 'READY' else 'NOT_READY' end matching_row_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when nullif(trim(coalesce(c.title,'')),'')='' or nullif(trim(coalesce(c.slug,'')),'') is null then 'NOT_READY' else 'READY' end catalog_row_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when nullif(trim(coalesce(c.title,'')),'') is null or nullif(trim(coalesce(c.slug,'')),'') is null or length(trim(coalesce(c.description,'')))<100 or nullif(trim(coalesce(c.organization,'')),'') is null then 'NOT_READY' else 'READY' end seo_row_state,
    case when c.seo_content_reason='SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' then 'READY' else 'NOT_READY' end seo_content_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end
      when nullif(trim(coalesce(c.title,'')),'') is null then 'MISSING_TITLE' when nullif(trim(coalesce(c.slug,'')),'') is null then 'MISSING_CANONICAL_IDENTITY'
      when length(trim(coalesce(c.description,'')))<100 then 'THIN_CONTENT' when nullif(trim(coalesce(c.organization,'')),'') is null then 'MISSING_ORGANIZATION' else 'SEO_ROW_READY' end seo_row_reason,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when not c.professional_fact then 'NOT_READY' else 'READY' end alerts_row_state,
    case when c.canonical_source='computrabajo' then case when current_date<=date '2026-10-09' then 'ACTIVE' else 'EXPIRED' end else 'NOT_APPLICABLE' end temporary_legacy_seo_exception_state,
    case when c.lifecycle_state='STALE_DERIVED_STATE' then c.lifecycle_reason
      when c.lifecycle_state<>'LIFECYCLE_UNKNOWN' then null
      when c.deadline_state='INVALID' then 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN'
      when c.observation_id is null then 'NO_OBSERVATION'
      when c.observation_canonical_source is not null and c.observation_canonical_source<>c.canonical_source then 'OBSERVATION_SOURCE_MISMATCH'
      when c.observation_status='IDENTITY_UNRESOLVED' then 'IDENTITY_UNRESOLVED'
      when c.observation_status='IDENTITY_MISMATCH' then 'IDENTITY_MISMATCH'
      when c.observation_http_status in (0,429) or c.observation_http_status>=500 then 'TRANSIENT_HTTP_EVIDENCE'
      when c.observation_status='IDENTITY_CONFIRMED' and c.observation_http_status=200 then 'OBSERVATION_NOT_NEWER_THAN_ROW_UPDATE'
      when c.observation_http_status is null then 'HTTP_STATUS_UNKNOWN'
      else 'LIFECYCLE_EVIDENCE_INSUFFICIENT' end lifecycle_unresolved_reason,
    case when c.lifecycle_state not in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then case when c.lifecycle_state in ('EXPIRED','DELETED','ARCHIVED','HARD_DEAD','INACTIVE_VALID') then 'EXPLICITLY_INACTIVE' else 'NOT_UNRESOLVED' end
      when c.lifecycle_state='STALE_DERIVED_STATE' and c.verification_status='verified' then 'RECOVERABLE_NOW'
      when c.seo_content_reason<>'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' then 'CONTENT_NOT_READY'
      when c.observation_id is not null and c.observation_canonical_source is not null and c.observation_canonical_source<>c.canonical_source then 'SYSTEM_ERROR'
      else 'REFRESH_REQUIRED' end lifecycle_recovery_class
  from classified c
),
states as (
 select d.*,
  case when d.matching_row_state<>'READY' then d.matching_row_state when d.matching_permission='DENIED' or d.source_operation_state='DENIED' or d.matching_switch_state='DENIED' then 'NOT_READY'
    when d.matching_permission is distinct from 'ALLOWED' or d.source_operation_state in ('UNKNOWN','CONFLICT') or d.matching_switch_state='UNKNOWN' then 'UNKNOWN' else 'READY' end final_matching_state,
  case when d.catalog_row_state<>'READY' then d.catalog_row_state when d.catalog_permission='DENIED' or d.source_operation_state='DENIED' or d.catalog_switch_state='DENIED' then 'NOT_READY' when d.catalog_permission is distinct from 'ALLOWED' or d.source_operation_state in ('UNKNOWN','CONFLICT') or d.catalog_switch_state='UNKNOWN' then 'UNKNOWN' else 'READY' end catalog_state,
  case when d.alerts_row_state<>'READY' then d.alerts_row_state when d.alerts_permission='DENIED' or d.source_operation_state='DENIED' or d.alerts_switch_state='DENIED' then 'NOT_READY' when d.alerts_permission is distinct from 'ALLOWED' or d.source_operation_state in ('UNKNOWN','CONFLICT') or d.alerts_switch_state='UNKNOWN' then 'UNKNOWN' else 'READY' end alerts_state,
  case when d.seo_row_state<>'READY' then d.seo_row_state when d.source_operation_state='DENIED' then 'NOT_READY' when d.source_operation_state in ('UNKNOWN','CONFLICT') then 'UNKNOWN' else 'READY' end seo_state,
  case when d.seo_row_state<>'READY' then d.seo_row_reason when d.source_operation_state='DENIED' then 'SOURCE_DISABLED' when d.source_operation_state in ('UNKNOWN','CONFLICT') then case when d.source_operation_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT' else 'SOURCE_OPERATIONAL_STATE_UNKNOWN' end else 'SEO_EFFECTIVE_READY' end seo_effective_reason
 from decisions d
),
failures as (
 select s.*,case when lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE_'||lifecycle_state
  when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY'
  when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN'
  when source_operation_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT'
  when matching_alias_conflict then 'SOURCE_POLICY_ALIAS_CONFLICT'
  when matching_permission='DENIED' then 'SOURCE_PERMISSION_DENIED'
  when matching_permission is distinct from 'ALLOWED' then 'SOURCE_PERMISSION_UNKNOWN'
  when source_operation_state='DENIED' then 'SOURCE_DISABLED'
  when source_operation_state='UNKNOWN' then 'SOURCE_OPERATION_UNKNOWN'
  when matching_switch_state='DENIED' then 'MATCHING_SWITCH_DISABLED'
  when matching_switch_state='UNKNOWN' then 'MATCHING_SWITCH_UNKNOWN'
  else 'FINAL_MATCHING_UNIVERSE' end first_failure
 from states s
),
summary as (
 select count(*) AS total_inventory,
  count(*) filter(where lifecycle_state='ACTIVE_VALID') active_valid,count(*) filter(where lifecycle_state='INACTIVE_VALID') inactive_valid,
  count(*) filter(where lifecycle_state='EXPIRED') expired,count(*) filter(where lifecycle_state='DELETED') deleted,
  count(*) filter(where lifecycle_state='ARCHIVED') archived,count(*) filter(where lifecycle_state='HARD_DEAD') hard_dead,0::bigint superseded_duplicate,
  count(*) filter(where lifecycle_state='STALE_DERIVED_STATE') stale_derived_state,count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
  count(*) filter(where professional_state='PROFESSIONAL_READY') professional_ready,count(*) filter(where professional_state='PROFESSIONAL_THIN') professional_thin,count(*) filter(where professional_state='PROFESSIONAL_UNKNOWN') professional_unknown,
  count(*) filter(where matching_row_state='READY') match_row_ready,count(*) filter(where matching_row_state='NOT_READY') match_row_not_ready,count(*) filter(where matching_row_state='UNKNOWN') match_row_unknown,
  count(*) filter(where matching_permission='ALLOWED') match_permission_allowed,count(*) filter(where matching_permission='DENIED') match_permission_denied,count(*) filter(where matching_permission is null or matching_permission='UNKNOWN') match_permission_unknown,
  count(*) filter(where matching_switch_state='ALLOWED') match_switch_allowed,count(*) filter(where matching_switch_state='DENIED') match_switch_denied,count(*) filter(where matching_switch_state='UNKNOWN') match_switch_unknown,
  count(*) filter(where final_matching_state='READY') final_matching_universe,count(*) filter(where catalog_state='READY') catalog_universe,count(*) filter(where alerts_state='READY') alert_universe,count(*) filter(where seo_state='READY') seo_universe,
  count(*) filter(where seo_row_state='READY') seo_row_ready,count(*) filter(where seo_row_state='NOT_READY') seo_row_not_ready,count(*) filter(where seo_row_state='UNKNOWN') seo_row_unknown,count(*) filter(where seo_state='READY') seo_effective_ready,
  count(*) filter(where seo_content_state='READY') seo_content_ready_independent_of_lifecycle,
  count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE')) lifecycle_unresolved_total,
  count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and seo_content_state='READY') seo_content_ready_while_lifecycle_unresolved,
  count(*) filter(where lifecycle_recovery_class='RECOVERABLE_NOW') lifecycle_recoverable_now,
  count(*) filter(where lifecycle_recovery_class='REFRESH_REQUIRED') lifecycle_refresh_required,
  count(*) filter(where lifecycle_recovery_class='CONTENT_NOT_READY') lifecycle_content_not_ready,
  count(*) filter(where lifecycle_recovery_class='SYSTEM_ERROR') lifecycle_system_error,
  count(*) filter(where lifecycle_recovery_class='EXPLICITLY_INACTIVE') lifecycle_explicitly_inactive_rows,
  count(*) filter(where seo_row_state='READY' and seo_permission='UNKNOWN') seo_permission_unknown_ready_rows,
  count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') or matching_row_state='UNKNOWN' or source_operation_state in ('UNKNOWN','CONFLICT') or (matching_row_state='READY' and matching_permission='UNKNOWN') or (matching_row_state='READY' and matching_permission='ALLOWED' and matching_switch_state='UNKNOWN') or (catalog_row_state='READY' and (catalog_permission='UNKNOWN' or catalog_switch_state='UNKNOWN')) or (alerts_row_state='READY' and (alerts_permission='UNKNOWN' or alerts_switch_state='UNKNOWN'))) routing_unresolved_total,
  count(*) filter(where any_permission_unknown) rows_with_any_source_permission_unknown,
  count(*) filter(where policy_alias_conflict) source_policy_alias_conflicts,
  coalesce(sum(unknown_permission_dimensions),0) unknown_permission_dimension_claims,
  count(*) filter(where (lifecycle_state='HARD_DEAD' and is_active=true) or (lifecycle_state='STALE_DERIVED_STATE' and verification_status='verified')) repairable_rows,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and match_eligible=true and is_enabled=true and matching_enabled=true) current_matching,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and catalog_eligible=true and is_enabled=true and catalog_enabled=true) current_catalog,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and alerts_eligible=true and is_enabled=true and alerts_enabled=true) current_alerts,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and seo_eligible=true and is_enabled=true and seo_enabled=true) current_seo,
  count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_ready,
  count(*) filter(where canonical_source='computrabajo' and temporary_legacy_seo_exception_state='ACTIVE' and seo_permission='DENIED' and seo_eligible=true and seo_status='eligible' and seo_row_state='READY' and source_operation_state='ALLOWED') temporary_legacy_seo_exception_active_rows
 from failures
),
life_counts as (select (select total_inventory from summary) total,sum(n) grouped from (select count(*) n from failures group by lifecycle_state) x),
match_counts as (select count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_ready,
 count(*) filter(where first_failure='FINAL_MATCHING_UNIVERSE') ready,
 count(*) filter(where first_failure in ('SOURCE_PERMISSION_DENIED','SOURCE_PERMISSION_UNKNOWN')) permission_failure,
 count(*) filter(where first_failure in ('SOURCE_DISABLED','SOURCE_OPERATION_UNKNOWN','SOURCE_POLICY_ALIAS_CONFLICT','MATCHING_SWITCH_DISABLED','MATCHING_SWITCH_UNKNOWN')) operational_failure,
 count(*) filter(where lifecycle_state='ACTIVE_VALID' and matching_row_state='NOT_READY') row_not_ready,count(*) filter(where lifecycle_state='ACTIVE_VALID' and matching_row_state='UNKNOWN') row_unknown from failures),
first_failure as (select jsonb_object_agg(first_failure,n order by first_failure) value from (select first_failure,count(*) n from failures group by first_failure) f),
per_source as (select coalesce(jsonb_agg(jsonb_build_object('source',q.canonical_source,'total',q.total,'lifecycle_ready',q.lifecycle_ready,'matching_row_ready',q.match_row_ready,'permission_allowed',q.permission_allowed,'permission_denied',q.permission_denied,'permission_unknown',q.permission_unknown,'matching_switch_current_allowed',q.switch_current_allowed,'matching_switch_current_denied',q.switch_current_denied,'matching_switch_current_unknown',q.switch_current_unknown,'final_matching',q.final_matching,'catalog',q.catalog,'alerts',q.alerts,'seo',q.seo,'seo_row_ready',q.seo_row_ready,'seo_row_not_ready',q.seo_row_not_ready,'seo_row_unknown',q.seo_row_unknown,'seo_effective_ready',q.seo_effective_ready,'seo_permission_unknown_ready_rows',q.seo_permission_unknown_ready_rows,'seo_block_reasons',q.seo_block_reasons,'current_matching',q.current_matching,'current_catalog',q.current_catalog,'current_alerts',q.current_alerts,'current_seo',q.current_seo,'catalog_removed',greatest(q.current_catalog-q.catalog,0),'catalog_added',greatest(q.catalog-q.current_catalog,0),'matching_removed',greatest(q.current_matching-q.final_matching,0),'matching_added',greatest(q.final_matching-q.current_matching,0),'alerts_removed',greatest(q.current_alerts-q.alerts,0),'alerts_added',greatest(q.alerts-q.current_alerts,0),'seo_removed',greatest(q.current_seo-q.seo,0),'seo_added',greatest(q.seo-q.current_seo,0)) order by q.total desc,q.canonical_source),'[]'::jsonb) value from (select canonical_source,count(*) total,count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_ready,count(*) filter(where matching_row_state='READY') match_row_ready,count(*) filter(where matching_permission='ALLOWED') permission_allowed,count(*) filter(where matching_permission='DENIED') permission_denied,count(*) filter(where matching_permission is null or matching_permission='UNKNOWN') permission_unknown,count(*) filter(where matching_switch_state='ALLOWED') switch_current_allowed,count(*) filter(where matching_switch_state='DENIED') switch_current_denied,count(*) filter(where matching_switch_state='UNKNOWN') switch_current_unknown,count(*) filter(where final_matching_state='READY') final_matching,count(*) filter(where catalog_state='READY') catalog,count(*) filter(where alerts_state='READY') alerts,count(*) filter(where seo_state='READY') seo,count(*) filter(where seo_row_state='READY') seo_row_ready,count(*) filter(where seo_row_state='NOT_READY') seo_row_not_ready,count(*) filter(where seo_row_state='UNKNOWN') seo_row_unknown,count(*) filter(where seo_state='READY') seo_effective_ready,count(*) filter(where seo_row_state='READY' and seo_permission='UNKNOWN') seo_permission_unknown_ready_rows,coalesce((select jsonb_object_agg(reason,n) from (select seo_effective_reason reason,count(*) n from failures f where f.canonical_source=outerq.canonical_source and f.seo_state<>'READY' group by seo_effective_reason) z),'{}'::jsonb) seo_block_reasons,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and match_eligible=true and is_enabled=true and matching_enabled=true) current_matching,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and catalog_eligible=true and is_enabled=true and catalog_enabled=true) current_catalog,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and alerts_eligible=true and is_enabled=true and alerts_enabled=true) current_alerts,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and seo_eligible=true and is_enabled=true and seo_enabled=true) current_seo from failures outerq group by canonical_source) q),
exclusions as (select jsonb_build_object('lifecycle_not_ready',(select count(*) from failures where lifecycle_state<>'ACTIVE_VALID'),'professional_thin',(select count(*) from failures where professional_state='PROFESSIONAL_THIN'),'row_match_unknown',(select count(*) from failures where matching_row_state='UNKNOWN'),'permission_denied',(select count(*) from failures where matching_permission='DENIED'),'permission_unknown',(select count(*) from failures where matching_permission is null or matching_permission='UNKNOWN'),'source_disabled',(select count(*) from failures where source_operation_state='DENIED'),'source_operation_unknown',(select count(*) from failures where source_operation_state='UNKNOWN'),'matching_switch_disabled',(select count(*) from failures where matching_switch_state='DENIED'),'matching_switch_unknown',(select count(*) from failures where matching_switch_state='UNKNOWN')) value)
select jsonb_build_object(
 'observed_at',now(),'TOTAL_INVENTORY',s.total_inventory,
 'PREDICTED_LIFECYCLE_GROUPS',jsonb_build_object('ACTIVE_VALID',s.active_valid,'INACTIVE_VALID',s.inactive_valid,'EXPIRED',s.expired,'DELETED',s.deleted,'ARCHIVED',s.archived,'HARD_DEAD',s.hard_dead,'SUPERSEDED_DUPLICATE',s.superseded_duplicate,'STALE_DERIVED_STATE',s.stale_derived_state,'LIFECYCLE_UNKNOWN',s.lifecycle_unknown),
 'PROFESSIONAL',jsonb_build_object('PROFESSIONAL_READY',s.professional_ready,'PROFESSIONAL_THIN',s.professional_thin,'PROFESSIONAL_UNKNOWN',s.professional_unknown),
 'MATCH',jsonb_build_object('MATCH_ROW_READY',s.match_row_ready,'MATCH_ROW_NOT_READY',s.match_row_not_ready,'MATCH_ROW_UNKNOWN',s.match_row_unknown),
 'SOURCE_PERMISSION',jsonb_build_object('MATCH_PERMISSION_ALLOWED',s.match_permission_allowed,'MATCH_PERMISSION_DENIED',s.match_permission_denied,'MATCH_PERMISSION_UNKNOWN',s.match_permission_unknown,'ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN',s.rows_with_any_source_permission_unknown,'SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS',s.unknown_permission_dimension_claims),
 'SOURCE_OPERATION',jsonb_build_object('MATCH_SWITCH',jsonb_build_object('ALLOWED',s.match_switch_allowed,'DENIED',s.match_switch_denied,'UNKNOWN',s.match_switch_unknown),'SOURCE_POLICY_ALIAS_CONFLICT_ROWS',s.source_policy_alias_conflicts),
 'FINAL_MATCHING_UNIVERSE',s.final_matching_universe,'CATALOG_UNIVERSE',s.catalog_universe,'ALERT_UNIVERSE',s.alert_universe,'SEO_UNIVERSE',s.seo_universe,
 'SEO_ROW_READY',s.seo_row_ready,'SEO_ROW_NOT_READY',s.seo_row_not_ready,'SEO_ROW_UNKNOWN',s.seo_row_unknown,'SEO_ROW_RECONCILIATION_DIFFERENCE',s.total_inventory - s.seo_row_ready - s.seo_row_not_ready - s.seo_row_unknown,'SEO_EFFECTIVE_READY',s.seo_effective_ready,'SEO_PERMISSION_UNKNOWN_READY_ROWS',s.seo_permission_unknown_ready_rows,
 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE',s.seo_content_ready_independent_of_lifecycle,
 'SEO_CONTENT_READY_WHILE_LIFECYCLE_UNRESOLVED',s.seo_content_ready_while_lifecycle_unresolved,
 'LIFECYCLE_UNRESOLVED_TOTAL',s.lifecycle_unresolved_total,'LIFECYCLE_RECOVERABLE_NOW',s.lifecycle_recoverable_now,'LIFECYCLE_REFRESH_REQUIRED',s.lifecycle_refresh_required,'LIFECYCLE_CONTENT_NOT_READY',s.lifecycle_content_not_ready,'LIFECYCLE_SYSTEM_ERROR',s.lifecycle_system_error,'LIFECYCLE_EXPLICITLY_INACTIVE_ROWS',s.lifecycle_explicitly_inactive_rows,
 'TOP_LIFECYCLE_UNRESOLVED_REASONS',(select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason),'[]'::jsonb) from (select lifecycle_unresolved_reason reason,count(*) n from failures where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by lifecycle_unresolved_reason) lifecycle_reasons),
 'LIFECYCLE_RECOVERY_PER_SOURCE',(select coalesce(jsonb_agg(jsonb_build_object('source',q.canonical_source,'lifecycle_unresolved_total',q.unresolved,'seo_content_ready_while_lifecycle_unresolved',q.content_ready,'recovery',q.recovery,'top_reasons',q.reasons) order by q.unresolved desc,q.canonical_source),'[]'::jsonb) from (select canonical_source,count(*) unresolved,count(*) filter(where seo_content_state='READY') content_ready,coalesce((select jsonb_object_agg(recovery_class,n) from (select lifecycle_recovery_class recovery_class,count(*) n from failures f where f.canonical_source=u.canonical_source and f.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by lifecycle_recovery_class) r),'{}'::jsonb) recovery,coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason) from (select lifecycle_unresolved_reason reason,count(*) n from failures f where f.canonical_source=u.canonical_source and f.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by lifecycle_unresolved_reason) r),'[]'::jsonb) reasons from failures u where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by canonical_source) q),
 'TOP_SEO_BLOCK_REASONS',(select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason),'[]'::jsonb) from (select seo_effective_reason reason,count(*) n from failures where seo_state<>'READY' group by seo_effective_reason) seo_reasons),
 'TOP_SEO_CONTENT_BLOCK_REASONS',(select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason),'[]'::jsonb) from (select seo_content_reason reason,count(*) n from failures where seo_content_state='NOT_READY' group by seo_content_reason) seo_content_reasons),
 'SEO_CONTENT_REASONS_PER_SOURCE',(select coalesce(jsonb_agg(jsonb_build_object('source',q.canonical_source,'content_ready',q.ready,'content_not_ready',q.not_ready,'reasons',q.reasons) order by q.total desc,q.canonical_source),'[]'::jsonb) from (select canonical_source,count(*) total,count(*) filter(where seo_content_state='READY') ready,count(*) filter(where seo_content_state='NOT_READY') not_ready,coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason) from (select seo_content_reason reason,count(*) n from failures f where f.canonical_source=u.canonical_source and seo_content_state='NOT_READY' group by seo_content_reason) r),'[]'::jsonb) reasons from failures u group by canonical_source) q),
 'ROUTING_UNRESOLVED_ROWS',s.routing_unresolved_total,'ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN',s.rows_with_any_source_permission_unknown,'SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS',s.unknown_permission_dimension_claims,'REPAIRABLE_ROWS',s.repairable_rows,'SOURCE_POLICY_ALIAS_CONFLICT_ROWS',s.source_policy_alias_conflicts,'FIRST_FAILURE',ff.value,'WHY_NOT_MATCH_UNIVERSE',e.value,'PER_SOURCE',ps.value,
 'TEMP_LEGACY_SEO_EXCEPTION',jsonb_build_object('name','TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09','source','computrabajo','permission_state','DENIED','state',case when current_date<=date '2026-10-09' then 'ACTIVE' else 'EXPIRED' end,'expires_on','2026-10-09','active_rows',s.temporary_legacy_seo_exception_active_rows,'reason','Preserves SEO-ready first-party rows during the live observation window; does not grant source permission or any other consumer.'),
 'CURRENT_VS_PREDICTED_IMPACT',jsonb_build_object('CURRENT_PUBLIC_CATALOG',s.current_catalog,'PREDICTED_CATALOG_UNIVERSE',s.catalog_universe,'CATALOG_ROWS_REMOVED',greatest(s.current_catalog-s.catalog_universe,0),'CATALOG_ROWS_ADDED',greatest(s.catalog_universe-s.current_catalog,0),'CURRENT_MATCHING_UNIVERSE',s.current_matching,'PREDICTED_FINAL_MATCHING_UNIVERSE',s.final_matching_universe,'MATCH_ROWS_REMOVED',greatest(s.current_matching-s.final_matching_universe,0),'MATCH_ROWS_ADDED',greatest(s.final_matching_universe-s.current_matching,0),'CURRENT_ALERT_UNIVERSE',s.current_alerts,'PREDICTED_ALERT_UNIVERSE',s.alert_universe,'CURRENT_SEO_UNIVERSE',s.current_seo,'PREDICTED_SEO_UNIVERSE',s.seo_universe),
 'RECONCILIATION_DIFFERENCE',jsonb_build_object('lifecycle',s.total_inventory-(s.active_valid+s.inactive_valid+s.expired+s.deleted+s.archived+s.hard_dead+s.superseded_duplicate+s.stale_derived_state+s.lifecycle_unknown),'matching_first_failure',s.total_inventory-(select coalesce(sum(n),0) from (select count(*) n from failures group by first_failure) groups),'active_matching',mc.lifecycle_ready-(mc.ready+mc.permission_failure+mc.operational_failure+mc.row_not_ready+mc.row_unknown),'difference',(select count(*) from failures)-(s.active_valid+s.inactive_valid+s.expired+s.deleted+s.archived+s.hard_dead+s.superseded_duplicate+s.stale_derived_state+s.lifecycle_unknown)),
 'RETRIEVAL_SCHEMA_PRESENCE',jsonb_build_object('opportunity_universe_state',to_regclass('public.opportunity_universe_state') is not null,'states',to_regclass('public.matching_retrieval_states') is not null,'candidates',to_regclass('public.matching_retrieval_candidates') is not null,'score_rpc',to_regprocedure('public.score_opportunity_embeddings(public.vector,text[])') is not null,'prune_rpc',to_regprocedure('public.prune_matching_retrieval_candidates()') is not null)
) as opportunity_universe_preflight
from summary s cross join first_failure ff cross join per_source ps cross join exclusions e cross join match_counts mc;
