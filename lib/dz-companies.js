/**
 * lib/dz-companies.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * قاعدة بيانات الشركات الجزائرية + Wikipedia / Wikidata lookup
 * Algerian Companies Knowledge Base — DZ-GPT
 *
 * Fonctionnalités / الوظائف:
 *  - KB statique (40+ entreprises algériennes) / قاعدة ثابتة لأبرز الشركات
 *  - Wikipedia AR/FR/EN fallback pour les entreprises inconnues
 *  - Wikidata structured data (secteur, fondation, siège...)
 *  - Détection intelligente des requêtes "شركة / company / entreprise"
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const WIKI_TIMEOUT = 12000

// ═══════════════════════════════════════════════════════════════════════════════
// KB — قاعدة بيانات الشركات الجزائرية (ثابتة — سريعة — بدون API)
// ═══════════════════════════════════════════════════════════════════════════════
export const DZ_COMPANIES_KB = {

  // ── طاقة / Énergie ────────────────────────────────────────────────────────
  'sonatrach': {
    nameAr: 'سوناطراك',
    nameFr: 'Sonatrach',
    nameEn: 'Sonatrach',
    aliases: ['سوناطراك', 'sonatrach', 'سونطراك'],
    sector: '⛽ طاقة / بترول وغاز',
    sectorFr: 'Pétrole & Gaz',
    founded: '1963',
    hq: 'الجزائر العاصمة',
    description: 'الشركة الوطنية للمحروقات. أكبر شركة في أفريقيا وأحد أكبر منتجي الغاز الطبيعي في العالم. تُسيطر على استخراج وتكرير ونقل وتسويق المحروقات الجزائرية.',
    descriptionFr: 'Société nationale des hydrocarbures, plus grande entreprise d\'Afrique. Contrôle l\'exploration, la production, le raffinage et la commercialisation des hydrocarbures algériens.',
    employees: '+85,000',
    wiki: 'https://ar.wikipedia.org/wiki/سوناطراك',
    wikiEn: 'https://en.wikipedia.org/wiki/Sonatrach',
    website: 'https://sonatrach.com',
  },

  'sonelgaz': {
    nameAr: 'سونلغاز',
    nameFr: 'Sonelgaz',
    nameEn: 'Sonelgaz',
    aliases: ['سونلغاز', 'sonelgaz', 'سوناليغاز'],
    sector: '⚡ كهرباء وغاز',
    sectorFr: 'Électricité & Gaz',
    founded: '1969',
    hq: 'الجزائر العاصمة',
    description: 'مجمع سونلغاز — الشركة الوطنية للكهرباء والغاز. تضمن توزيع الكهرباء والغاز عبر التراب الجزائري وتمتلك شبكات ضخمة من خطوط النقل والتوزيع.',
    descriptionFr: 'Groupe Sonelgaz, distributeur national d\'électricité et de gaz en Algérie.',
    employees: '+80,000',
    wiki: 'https://ar.wikipedia.org/wiki/سونلغاز',
    website: 'https://sonelgaz.dz',
  },

  'entp': {
    nameAr: 'المؤسسة الوطنية لخدمات الآبار',
    nameFr: 'ENTP',
    nameEn: 'ENTP (National Enterprise for Well Services)',
    aliases: ['entp', 'ENTP', 'المؤسسة الوطنية لخدمات الآبار', 'انتيبي'],
    sector: '🛢️ خدمات النفط والغاز',
    sectorFr: 'Services pétroliers',
    founded: '1981',
    hq: 'حاسي مسعود',
    description: 'المؤسسة الوطنية لخدمات الآبار (ENTP) — مؤسسة عمومية اقتصادية جزائرية متخصصة في الحفر وخدمات الآبار البترولية. تشغل حفارات في الجزائر وعدد من الدول الأفريقية.',
    descriptionFr: 'Entreprise Nationale de Travaux aux Puits (ENTP), spécialisée dans le forage et les services puits pétroliers.',
    employees: '+5,000',
    wiki: 'https://ar.wikipedia.org/wiki/المؤسسة_الوطنية_لخدمات_الآبار',
    wikiEn: 'https://en.wikipedia.org/wiki/ENTP_(Algeria)',
    website: 'https://entp.dz',
  },

  'enafor': {
    nameAr: 'إينافور',
    nameFr: 'ENAFOR',
    nameEn: 'ENAFOR (National Enterprise for Drilling)',
    aliases: ['enafor', 'ENAFOR', 'إينافور', 'اينافور', 'الشركة الوطنية للحفر'],
    sector: '🛢️ حفر بترولي',
    sectorFr: 'Forage pétrolier',
    founded: '1981',
    hq: 'حاسي مسعود',
    description: 'المؤسسة الوطنية للحفر (ENAFOR) — شركة جزائرية عمومية متخصصة في أعمال الحفر البترولي وتابعة لمجموعة سوناطراك. تُشغّل أسطولاً من أجهزة الحفر للتنقيب عن النفط والغاز.',
    descriptionFr: 'ENAFOR, entreprise nationale de forage pétrolier, filiale du groupe Sonatrach. Opère une flotte de foreuses pour l\'exploration et la production d\'hydrocarbures.',
    employees: '+4,000',
    wiki: 'https://en.wikipedia.org/wiki/ENAFOR',
    website: 'https://enafor.dz',
  },

  'sarpi': {
    nameAr: 'سارپي',
    nameFr: 'SARPI',
    nameEn: 'SARPI (Algerian Society for Oil Refining and Industrial Products)',
    aliases: ['sarpi', 'SARPI', 'سارپي', 'سارفي', 'سارپي الجزائر'],
    sector: '🏭 تكرير البترول',
    sectorFr: 'Raffinage pétrolier',
    founded: '1982',
    hq: 'عين أميناس / وهران',
    description: 'SARPI — الشركة الجزائرية لتكرير البترول والمنتجات الصناعية. متخصصة في تكرير النفط الخام وإنتاج المشتقات البترولية، تابعة لمجموعة سوناطراك.',
    descriptionFr: 'SARPI, Société Algérienne de Raffinage et de Produits Industriels, spécialisée dans le raffinage du pétrole brut.',
    employees: '+1,500',
  },

  'redmed': {
    nameAr: 'ريد ميد',
    nameFr: 'Red Med',
    nameEn: 'Red Med',
    aliases: ['red med', 'redmed', 'Red Med', 'ريد ميد', 'ريدميد'],
    sector: '🚢 خدمات بحرية / نقل',
    sectorFr: 'Services maritimes / Transport',
    founded: '2008',
    hq: 'الجزائر العاصمة',
    description: 'Red Med — شركة جزائرية متخصصة في الخدمات البحرية والنقل البحري. توفر خدمات الشحن، الوكالة البحرية، اللوجستيك والعمليات الميناءية في الجزائر وحوض البحر المتوسط.',
    descriptionFr: 'Red Med, entreprise algérienne spécialisée dans les services maritimes, l\'agence maritime, la logistique portuaire en Algérie et en Méditerranée.',
  },

  'bayat': {
    nameAr: 'بايات',
    nameFr: 'Bayat Group',
    nameEn: 'Bayat Group',
    aliases: ['bayat', 'Bayat', 'بايات', 'مجمع بايات', 'bayat group'],
    sector: '🏗️ بناء / استثمار / تجزئة',
    sectorFr: 'Construction / Investissement / Distribution',
    founded: '1990',
    hq: 'الجزائر العاصمة',
    description: 'مجمع بايات — من أكبر المجمعات الخاصة في الجزائر. ينشط في قطاعات البناء، التجزئة الغذائية، الإنتاج الصناعي، والاستيراد. من أبرز شركاته سلاسل التوزيع والأسواق الكبرى.',
    descriptionFr: 'Groupe Bayat, l\'un des plus grands groupes privés en Algérie. Actif dans la construction, la grande distribution, l\'industrie et l\'import-export.',
  },

  // ── بنوك وتمويل / Banques & Finance ──────────────────────────────────────
  'cpa': {
    nameAr: 'القرض الشعبي الجزائري',
    nameFr: 'CPA (Crédit Populaire d\'Algérie)',
    nameEn: 'Crédit Populaire d\'Algérie',
    aliases: ['cpa', 'CPA', 'القرض الشعبي', 'القرض الشعبي الجزائري'],
    sector: '🏦 بنك عمومي',
    sectorFr: 'Banque publique',
    founded: '1966',
    hq: 'الجزائر العاصمة',
    description: 'القرض الشعبي الجزائري (CPA) — بنك عمومي تجاري يموّل القطاعات الاقتصادية الكبرى ويقدم خدمات مصرفية للأفراد والمؤسسات عبر شبكة واسعة من الوكالات.',
    descriptionFr: 'CPA, banque publique commerciale finançant les secteurs économiques majeurs en Algérie.',
    website: 'https://cpa.dz',
  },

  'bna': {
    nameAr: 'بنك الجزائر الوطني',
    nameFr: 'BNA (Banque Nationale d\'Algérie)',
    nameEn: 'Banque Nationale d\'Algérie',
    aliases: ['bna', 'BNA', 'البنك الوطني الجزائري', 'بنك الجزائر الوطني'],
    sector: '🏦 بنك عمومي',
    sectorFr: 'Banque publique',
    founded: '1966',
    hq: 'الجزائر العاصمة',
    description: 'البنك الوطني الجزائري (BNA) — أحد أكبر البنوك العمومية في الجزائر، متخصص في تمويل قطاع الفلاحة والصناعة والتجارة.',
    descriptionFr: 'BNA, grande banque publique algérienne, spécialisée dans le financement de l\'agriculture, l\'industrie et le commerce.',
    website: 'https://bna.dz',
  },

  // ── صناعة / Industrie ─────────────────────────────────────────────────────
  'snvi': {
    nameAr: 'المجمع الوطني لعربات النقل الصناعية',
    nameFr: 'SNVI',
    nameEn: 'SNVI (National Industrial Vehicle Corporation)',
    aliases: ['snvi', 'SNVI', 'عربات نقل', 'مجمع روبي'],
    sector: '🚛 صناعة السيارات والمركبات',
    sectorFr: 'Industrie automobile / Véhicules industriels',
    founded: '1981',
    hq: 'رويبة، الجزائر',
    description: 'SNVI — الشركة الوطنية لعربات النقل الصناعية. تصنع الشاحنات والحافلات والمركبات الصناعية. مصانعها في رويبة (الجزائر) وتُغطي أسواق المغرب العربي وأفريقيا.',
    descriptionFr: 'SNVI, fabricant national de véhicules industriels (camions, bus) basé à Rouïba.',
    wiki: 'https://ar.wikipedia.org/wiki/المجمع_الوطني_لعربات_النقل_الصناعية',
  },

  'enie': {
    nameAr: 'المؤسسة الوطنية لصناعة الإلكترونيك',
    nameFr: 'ENIE',
    nameEn: 'ENIE (National Electronic Industry Enterprise)',
    aliases: ['enie', 'ENIE', 'سيدي بلعباس إلكترونيك'],
    sector: '📡 إلكترونيك وتقنية',
    sectorFr: 'Électronique & Technologie',
    founded: '1983',
    hq: 'سيدي بلعباس',
    description: 'ENIE — المؤسسة الوطنية لصناعة الإلكترونيك في سيدي بلعباس. تصنع الأجهزة الإلكترونية، أجهزة التلفزيون، والمعدات الكهرومنزلية وتُعدّ من أوائل المصانع الإلكترونية في الجزائر.',
    descriptionFr: 'ENIE, entreprise nationale de fabrication d\'appareils électroniques à Sidi Bel Abbès.',
  },

  'cevital': {
    nameAr: 'سيفيتال',
    nameFr: 'Cevital',
    nameEn: 'Cevital Group',
    aliases: ['cevital', 'Cevital', 'سيفيتال', 'مجمع سيفيتال'],
    sector: '🏭 صناعة غذائية / مجمع خاص',
    sectorFr: 'Agroalimentaire / Conglomérat privé',
    founded: '1998',
    hq: 'بجاية',
    description: 'مجمع سيفيتال — أكبر مجمع خاص في الجزائر، مملوك للمستثمر إسعد ربراب. ينشط في الصناعات الغذائية (زيوت، سكر، مياه)، والصناعة الثقيلة، والتوزيع. من أسرع الشركات نمواً في أفريقيا.',
    descriptionFr: 'Cevital, plus grand groupe privé algérien fondé par Issad Rebrab. Actif dans l\'agroalimentaire, l\'industrie lourde et la distribution.',
    employees: '+20,000',
    wiki: 'https://ar.wikipedia.org/wiki/سيفيتال',
    wikiEn: 'https://en.wikipedia.org/wiki/Cevital',
    website: 'https://cevital.com',
  },

  'condor': {
    nameAr: 'كوندور إلكترونيكس',
    nameFr: 'Condor Electronics',
    nameEn: 'Condor Electronics',
    aliases: ['condor', 'Condor', 'كوندور', 'كوندور إلكترونيكس'],
    sector: '📱 إلكترونيك / تكنولوجيا',
    sectorFr: 'Électronique / Technologie',
    founded: '2002',
    hq: 'برج بوعريريج',
    description: 'كوندور إلكترونيكس — شركة جزائرية خاصة رائدة في تصنيع الأجهزة الإلكترونية والهواتف الذكية والأجهزة المنزلية. تمتلك مصانع في برج بوعريريج وتُصدّر لعدة دول أفريقية.',
    descriptionFr: 'Condor Electronics, leader algérien dans la fabrication d\'électronique grand public, smartphones et électroménager à Bordj Bou Arréridj.',
    wiki: 'https://ar.wikipedia.org/wiki/كوندور_إلكترونيكس',
    wikiEn: 'https://en.wikipedia.org/wiki/Condor_Electronics',
    website: 'https://condor.dz',
  },

  // ── اتصالات / Télécommunications ──────────────────────────────────────────
  'djezzy': {
    nameAr: 'جازي',
    nameFr: 'Djezzy',
    nameEn: 'Djezzy',
    aliases: ['djezzy', 'Djezzy', 'جازي', 'OTA', 'أوراسكوم تيليكوم'],
    sector: '📶 اتصالات',
    sectorFr: 'Télécommunications',
    founded: '2001',
    hq: 'الجزائر العاصمة',
    description: 'جازي — شركة اتصالات جزائرية من أكبر مشغلي الهاتف المحمول في الجزائر. تقدم خدمات الاتصال والبيانات لملايين المشتركين.',
    descriptionFr: 'Djezzy, opérateur téléphonique mobile majeur en Algérie.',
    wiki: 'https://ar.wikipedia.org/wiki/جازي',
    website: 'https://djezzy.com',
  },

  'mobilis': {
    nameAr: 'موبيليس',
    nameFr: 'Mobilis',
    nameEn: 'Mobilis',
    aliases: ['mobilis', 'Mobilis', 'موبيليس', 'ATM Mobilis'],
    sector: '📶 اتصالات عمومية',
    sectorFr: 'Télécommunications publiques',
    founded: '2003',
    hq: 'الجزائر العاصمة',
    description: 'موبيليس — المشغل العمومي للهاتف المحمول في الجزائر، تابع لمجمع اتصالات الجزائر. تُغطي شبكته كامل التراب الجزائري بما فيه المناطق النائية.',
    descriptionFr: 'Mobilis, opérateur public de téléphonie mobile en Algérie, filiale d\'Algérie Télécom.',
    website: 'https://mobilis.dz',
  },

  'ooredoo': {
    nameAr: 'أوريدو الجزائر',
    nameFr: 'Ooredoo Algérie',
    nameEn: 'Ooredoo Algeria',
    aliases: ['ooredoo', 'Ooredoo', 'أوريدو', 'نجمة', 'Nedjma'],
    sector: '📶 اتصالات',
    sectorFr: 'Télécommunications',
    founded: '2004',
    hq: 'الجزائر العاصمة',
    description: 'أوريدو الجزائر (المعروفة سابقاً بـ نجمة) — أحد أكبر مشغلي الهاتف المحمول في الجزائر، جزء من مجموعة أوريدو القطرية الدولية.',
    descriptionFr: 'Ooredoo Algérie (ex-Nedjma), opérateur de téléphonie mobile, filiale du groupe Ooredoo Qatar.',
    website: 'https://ooredoo.dz',
  },

  // ── بناء وأشغال عمومية / BTP ──────────────────────────────────────────────
  'cosider': {
    nameAr: 'كوسيدار',
    nameFr: 'Cosider',
    nameEn: 'Cosider Group',
    aliases: ['cosider', 'Cosider', 'كوسيدار', 'كوزيدار'],
    sector: '🏗️ بناء وأشغال عمومية',
    sectorFr: 'BTP (Bâtiment & Travaux Publics)',
    founded: '1974',
    hq: 'الجزائر العاصمة',
    description: 'مجمع كوسيدار — من أكبر مجمعات البناء والأشغال العمومية في الجزائر. ينجز مشاريع السكن، الطرق، الأنفاق والبنى التحتية الكبرى عبر كامل التراب الوطني.',
    descriptionFr: 'Cosider, grand groupe algérien de BTP réalisant logements, routes, tunnels et grandes infrastructures.',
    wiki: 'https://ar.wikipedia.org/wiki/كوسيدار',
    website: 'https://cosider.dz',
  },

  'apc': {
    nameAr: 'مجمع آبك',
    nameFr: 'APC (Algerian Pipes Company)',
    nameEn: 'APC Algeria',
    aliases: ['apc', 'APC', 'آبك', 'الشركة الجزائرية للأنابيب'],
    sector: '🔩 صناعة أنابيب ومعدات',
    sectorFr: 'Industrie / Tuyauterie',
    founded: '1985',
    hq: 'عنابة',
    description: 'APC — الشركة الجزائرية لصناعة الأنابيب الفولاذية. تُنتج الأنابيب المستخدمة في نقل المحروقات وتُعدّ موردًا استراتيجياً لمجمع سوناطراك.',
    descriptionFr: 'APC, fabricant algérien de tubes en acier pour le transport des hydrocarbures, fournisseur de Sonatrach.',
  },

  'lafarge': {
    nameAr: 'لافارج الجزائر',
    nameFr: 'LafargeHolcim Algérie',
    nameEn: 'LafargeHolcim Algeria',
    aliases: ['lafarge', 'LafargeHolcim', 'لافارج', 'لافارج الجزائر'],
    sector: '🏭 أسمنت / مواد بناء',
    sectorFr: 'Ciment / Matériaux de construction',
    founded: '1999',
    hq: 'الجزائر العاصمة',
    description: 'لافارج الجزائر — شركة مشتركة بين المجموعة الدولية LafargeHolcim والشريك الجزائري. تُنتج الأسمنت ومواد البناء وتمتلك مصانع في مناطق متعددة من الجزائر.',
    descriptionFr: 'LafargeHolcim Algérie, producteur de ciment et matériaux de construction.',
  },

  // ── تأمين / Assurances ────────────────────────────────────────────────────
  'caar': {
    nameAr: 'الشركة الجزائرية للتأمين وإعادة التأمين',
    nameFr: 'CAAR',
    nameEn: 'CAAR (Algerian Reinsurance Company)',
    aliases: ['caar', 'CAAR', 'التأمين وإعادة التأمين'],
    sector: '🛡️ تأمين وإعادة تأمين',
    sectorFr: 'Assurance & Réassurance',
    founded: '1963',
    hq: 'الجزائر العاصمة',
    description: 'CAAR — الشركة الجزائرية للتأمين وإعادة التأمين. من أقدم وأكبر شركات التأمين في الجزائر، متخصصة في التأمين الصناعي وإعادة التأمين.',
    descriptionFr: 'CAAR, première compagnie d\'assurance et de réassurance en Algérie.',
    website: 'https://caar.dz',
  },

  // ── فلاحة وغذاء / Agroalimentaire ────────────────────────────────────────
  'giplait': {
    nameAr: 'جيبلي',
    nameFr: 'GIPLAIT',
    nameEn: 'GIPLAIT (Algerian Milk Industry Group)',
    aliases: ['giplait', 'GIPLAIT', 'جيبلي', 'مجمع الحليب'],
    sector: '🥛 صناعة الألبان / غذاء',
    sectorFr: 'Industrie laitière / Agroalimentaire',
    founded: '1985',
    hq: 'الجزائر العاصمة',
    description: 'GIPLAIT — مجمع صناعات الحليب الجزائري. يُعدّ من أكبر منتجي الحليب ومشتقاته في الجزائر ويموّن السوق الوطنية بالمنتجات الألبانية المدعّمة.',
    descriptionFr: 'GIPLAIT, groupe industriel laitier algérien, principal fournisseur de lait et dérivés sur le marché national.',
  },

  // ── نقل / Transport ───────────────────────────────────────────────────────
  'air algerie': {
    nameAr: 'الخطوط الجوية الجزائرية',
    nameFr: 'Air Algérie',
    nameEn: 'Air Algérie',
    aliases: ['air algerie', 'Air Algérie', 'الخطوط الجوية الجزائرية', 'الخطوط الجزائرية'],
    sector: '✈️ طيران',
    sectorFr: 'Aviation',
    founded: '1947',
    hq: 'الجزائر العاصمة',
    description: 'الخطوط الجوية الجزائرية — الناقل الوطني الجوي للجزائر. تشغّل رحلات داخلية وإقليمية ودولية من مطار هواري بومدين الدولي.',
    descriptionFr: 'Air Algérie, compagnie aérienne nationale algérienne opérant des vols intérieurs et internationaux depuis Alger.',
    wiki: 'https://ar.wikipedia.org/wiki/الخطوط_الجوية_الجزائرية',
    wikiEn: 'https://en.wikipedia.org/wiki/Air_Algérie',
    website: 'https://airalgerie.dz',
  },

  'sntv': {
    nameAr: 'الشركة الوطنية لنقل البضائع',
    nameFr: 'SNTV',
    nameEn: 'SNTV',
    aliases: ['sntv', 'SNTV', 'نقل بضائع'],
    sector: '🚚 نقل البضائع',
    sectorFr: 'Transport de marchandises',
    founded: '1967',
    hq: 'الجزائر العاصمة',
    description: 'SNTV — الشركة الوطنية لنقل البضائع عبر الطرق. تُنظّم نقل البضائع الكبير عبر التراب الجزائري.',
    descriptionFr: 'SNTV, entreprise nationale de transport routier de marchandises en Algérie.',
  },

  // ── فندقة / Hôtellerie ────────────────────────────────────────────────────
  'els': {
    nameAr: 'مجمع الأوراسي',
    nameFr: 'ELS (El Aurassi)',
    nameEn: 'El Aurassi Hotel',
    aliases: ['aurassi', 'الاوراسي', 'الأوراسي', 'فندق الأوراسي', 'els'],
    sector: '🏨 فندقة وسياحة',
    sectorFr: 'Hôtellerie & Tourisme',
    founded: '1975',
    hq: 'الجزائر العاصمة',
    description: 'مجمع الأوراسي — يضم فندق الأوراسي الشهير في الجزائر العاصمة، أحد أبرز فنادق الجزائر 5 نجوم. يعمل كمرجع في قطاع الفندقة والمؤتمرات.',
    descriptionFr: 'Complexe El Aurassi, hôtel 5 étoiles emblématique d\'Alger, référence de l\'hôtellerie algérienne.',
  },

  // ── صيدلة / Pharmacie ─────────────────────────────────────────────────────
  'saidal': {
    nameAr: 'مجمع صيدال',
    nameFr: 'Saidal',
    nameEn: 'Saidal Group',
    aliases: ['saidal', 'Saidal', 'صيدال', 'مجمع صيدال'],
    sector: '💊 صناعة دوائية',
    sectorFr: 'Industrie pharmaceutique',
    founded: '1985',
    hq: 'الجزائر العاصمة',
    description: 'مجمع صيدال — أكبر شركة جزائرية لصناعة الأدوية. تُنتج مجموعة واسعة من الأدوية الجنيسة وتُلبّي جزءاً مهماً من حاجة السوق الجزائرية الدوائية.',
    descriptionFr: 'Groupe Saidal, plus grand fabricant algérien de médicaments génériques.',
    wiki: 'https://ar.wikipedia.org/wiki/مجمع_صيدال',
    website: 'https://saidal.dz',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION — كشف استعلامات الشركات الجزائرية
// ═══════════════════════════════════════════════════════════════════════════════

const _COMPANY_TRIGGERS_AR = [
  'شركة', 'مؤسسة', 'مجمع', 'مصنع', 'شركة الجزائر', 'شركات جزائرية',
  'ما هي شركة', 'عن شركة', 'معلومات عن', 'اخبرني عن شركة',
  'تعريف شركة', 'ما هو', 'من أين', 'أين تقع', 'أين مقر',
]
const _COMPANY_TRIGGERS_FR = [
  'entreprise', 'société', 'groupe', 'compagnie', 'usine', 'holding',
  'c\'est quoi', 'qu\'est-ce que', 'parle-moi de', 'infos sur',
]
const _COMPANY_TRIGGERS_EN = [
  'company', 'corporation', 'group', 'enterprise', 'firm', 'industry',
  'what is', 'tell me about', 'info about', 'about the company',
]

// كل أسماء/مستعارات الشركات في KB
const _ALL_ALIASES = Object.values(DZ_COMPANIES_KB).flatMap(c => c.aliases || [])

/**
 * يكشف إذا كان الاستعلام يتعلق بشركة جزائرية.
 * يعيد { companyKey, company } أو null.
 */
export function detectAlgerianCompanyQuery(q = '') {
  const lower = q.toLowerCase().trim()

  // 1. تطابق مباشر مع مستعارات الشركات في KB
  for (const [key, company] of Object.entries(DZ_COMPANIES_KB)) {
    const aliases = company.aliases || []
    for (const alias of aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return { companyKey: key, company }
      }
    }
  }

  // 2. trigger + كلمات عامة عن شركات جزائرية (بدون اسم محدد)
  const hasCompanyTrigger = (
    _COMPANY_TRIGGERS_AR.some(t => lower.includes(t)) ||
    _COMPANY_TRIGGERS_FR.some(t => lower.includes(t)) ||
    _COMPANY_TRIGGERS_EN.some(t => lower.includes(t))
  )
  const hasAlgeriaMention = /جزائر|algeria|algérie|dz\b/i.test(lower)

  if (hasCompanyTrigger && hasAlgeriaMention) {
    return { companyKey: null, company: null, generalQuery: true, rawQuery: q }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIKIPEDIA LOOKUP — البحث الحي من Wikipedia للشركات
// ═══════════════════════════════════════════════════════════════════════════════

async function _wikiSearchCompany(name) {
  const langs = ['ar', 'fr', 'en']
  for (const lang of langs) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
    try {
      const sUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
        action: 'opensearch', search: name, limit: '3',
        namespace: '0', format: 'json', origin: '*',
      })
      const sRes = await fetch(sUrl, { signal: ac.signal })
      clearTimeout(timer)
      if (!sRes.ok) continue
      const [, titles, , urls] = await sRes.json()
      if (!titles?.length) continue

      const title = titles[0]
      const url = urls?.[0] || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`

      // Extract
      const eAc = new AbortController()
      const eTimer = setTimeout(() => eAc.abort(), WIKI_TIMEOUT)
      const eUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
        action: 'query', prop: 'extracts|description',
        exintro: '1', explaintext: '1', exsentences: '8',
        titles: title, format: 'json', origin: '*', redirects: '1',
      })
      const eRes = await fetch(eUrl, { signal: eAc.signal })
      clearTimeout(eTimer)
      if (!eRes.ok) continue
      const eData = await eRes.json()
      const pages = Object.values(eData?.query?.pages || {})
      const page = pages[0]
      if (!page || page.missing) continue
      if (!page.extract || page.extract.length < 50) continue

      return {
        title: page.title,
        extract: page.extract,
        description: page.description || '',
        url,
        lang,
      }
    } catch {
      clearTimeout(timer)
    }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMATTER — تنسيق الرد
// ═══════════════════════════════════════════════════════════════════════════════

function _formatCompanyResponse(company, wikiData = null) {
  const lines = []

  lines.push(`## 🏢 ${company.nameAr} — *${company.nameFr || company.nameEn || ''}*`)
  lines.push(``)

  if (company.sector) {
    lines.push(`> **القطاع / Secteur:** ${company.sector}`)
  }
  if (company.founded) {
    lines.push(`> **تأسست / Fondée:** ${company.founded}`)
  }
  if (company.hq) {
    lines.push(`> **المقر / Siège:** ${company.hq}`)
  }
  if (company.employees) {
    lines.push(`> **الموظفون / Employés:** ${company.employees}`)
  }
  lines.push(``)

  if (company.description) {
    lines.push(`### 📋 نبذة عامة`)
    lines.push(company.description)
    lines.push(``)
  }

  if (company.descriptionFr) {
    lines.push(`### 🇫🇷 Description`)
    lines.push(`*${company.descriptionFr}*`)
    lines.push(``)
  }

  // Wikipedia extract (إضافي — من البحث الحي)
  if (wikiData?.extract && wikiData.extract.length > 100) {
    lines.push(`### 📖 من Wikipedia`)
    lines.push(wikiData.extract.slice(0, 800).trim())
    if (wikiData.extract.length > 800) lines.push(`*... [اقرأ المزيد](${wikiData.url})*`)
    lines.push(``)
  }

  // مصادر
  lines.push(`---`)
  lines.push(`| المصدر / Source | الرابط |`)
  lines.push(`|-----------------|--------|`)
  if (company.wiki) {
    lines.push(`| 📚 **Wikipedia (عربي)** | [رابط](${company.wiki}) |`)
  }
  if (company.wikiEn) {
    lines.push(`| 📚 **Wikipedia (English)** | [رابط](${company.wikiEn}) |`)
  }
  if (wikiData?.url && !company.wiki) {
    lines.push(`| 📚 **Wikipedia** | [${wikiData.title}](${wikiData.url}) |`)
  }
  if (company.website) {
    lines.push(`| 🌐 **الموقع الرسمي** | [${company.website}](${company.website}) |`)
  }
  lines.push(``)
  lines.push(`> 🇩🇿 *معلومات من قاعدة بيانات DZ-GPT للشركات الجزائرية — 2026*`)

  return lines.join('\n')
}

function _formatGeneralCompaniesResponse() {
  const sectors = {}
  for (const c of Object.values(DZ_COMPANIES_KB)) {
    const s = c.sector || 'أخرى'
    if (!sectors[s]) sectors[s] = []
    sectors[s].push(`**${c.nameAr}** *(${c.nameFr || c.nameEn})*`)
  }

  const lines = [
    `## 🏢 أبرز الشركات الجزائرية`,
    ``,
    `> اسألني عن أي شركة بالتفصيل — ex: "أخبرني عن سوناطراك" أو "what is Condor Electronics?"`,
    ``,
  ]

  for (const [sector, companies] of Object.entries(sectors)) {
    lines.push(`### ${sector}`)
    for (const c of companies) lines.push(`- ${c}`)
    lines.push(``)
  }

  lines.push(`---`)
  lines.push(`> 🇩🇿 *DZ-GPT — قاعدة بيانات الشركات الجزائرية | Base de données entreprises algériennes*`)
  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RESOLVER — الدالة الرئيسية
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * يحلّ استعلام شركة جزائرية — KB أولاً ثم Wikipedia fallback.
 * @param {string} q - استعلام المستخدم
 * @returns {{ content: string, model: string, found: boolean } | null}
 */
export async function resolveAlgerianCompanyQuery(q = '') {
  const detected = detectAlgerianCompanyQuery(q)
  if (!detected) return null

  // استعلام عام عن شركات جزائرية
  if (detected.generalQuery) {
    console.log('[DZCompanies] 📋 General query — returning company list')
    return {
      content: _formatGeneralCompaniesResponse(),
      model: 'dz-companies-list',
      found: true,
    }
  }

  const { companyKey, company } = detected
  console.log(`[DZCompanies] 🔍 KB hit: "${companyKey}"`)

  // KB موجودة — نجلب Wikipedia بالتوازي لتغنية الرد
  let wikiData = null
  const searchName = company.nameEn || company.nameFr || company.nameAr
  try {
    wikiData = await _wikiSearchCompany(searchName)
    if (wikiData) console.log(`[DZCompanies] ✅ Wiki: "${wikiData.title}" (${wikiData.lang})`)
  } catch (e) {
    console.warn(`[DZCompanies] ⚠️ Wiki fetch failed: ${e.message?.slice(0, 60)}`)
  }

  return {
    content: _formatCompanyResponse(company, wikiData),
    model: 'dz-companies-kb' + (wikiData ? '+wiki' : ''),
    found: true,
    _bypassLLM: true,
  }
}

/**
 * يبحث عن شركة جزائرية غير معروفة مباشرةً في Wikipedia (fallback للـ LLM).
 * مفيد للشركات خارج الـ KB.
 * @param {string} companyName
 * @returns {{ content: string, model: string, found: boolean } | null}
 */
export async function lookupUnknownAlgerianCompany(companyName) {
  if (!companyName || companyName.length < 2) return null
  console.log(`[DZCompanies:Wiki] 🔍 Unknown company: "${companyName}"`)
  const wikiData = await _wikiSearchCompany(companyName + ' Algeria')
    .catch(() => null)
    || await _wikiSearchCompany(companyName + ' Algérie')
    .catch(() => null)
    || await _wikiSearchCompany(companyName)
    .catch(() => null)

  if (!wikiData || wikiData.extract.length < 80) return null

  const lines = [
    `## 🏢 ${companyName}`,
    ``,
    `> 🇩🇿 شركة جزائرية — معلومات من Wikipedia`,
    ``,
    `### 📖 نبذة`,
    wikiData.extract.slice(0, 900).trim(),
    ``,
    `---`,
    `| المصدر | الرابط |`,
    `|--------|--------|`,
    `| 📚 **Wikipedia** | [${wikiData.title}](${wikiData.url}) |`,
    ``,
    `> *DZ-GPT — Algerian Companies Database 2026*`,
  ]

  return {
    content: lines.join('\n'),
    model: 'dz-companies-wiki-live',
    found: true,
    _bypassLLM: true,
  }
}
