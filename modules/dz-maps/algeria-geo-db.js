/**
 * Algeria Comprehensive Geographic Database
 * All 58 Wilayas + Major Daïras, Communes & Cities
 * Sources: Wikipedia, OSM, GeoNames
 */

export const ALGERIA_GEO_DB = [
  // ── WILAYA 01 ────────────────────────────────────────────────────────────
  { code:'01', name:'Adrar', nameAr:'أدرار', nameFr:'Adrar', type:'wilaya', lat:27.8741, lng:-0.2889,
    aliases:['ادرار','adrar'],
    communes:[
      { name:'Adrar', nameAr:'أدرار', lat:27.8741, lng:-0.2889 },
      { name:'Aoulef', nameAr:'أولف', lat:26.9736, lng:1.0794 },
      { name:'Reggane', nameAr:'رقان', lat:26.7167, lng:0.1667 },
      { name:'Timimoun', nameAr:'تيميمون', lat:29.2639, lng:0.2369 },
      { name:'Zaouiet Kounta', nameAr:'زاوية كنتة', lat:27.2333, lng:-0.2000 },
    ]
  },
  // ── WILAYA 02 ────────────────────────────────────────────────────────────
  { code:'02', name:'Chlef', nameAr:'الشلف', nameFr:'Chlef', type:'wilaya', lat:36.1653, lng:1.3338,
    aliases:['شلف','الشلف','chlef','ech cheliff'],
    communes:[
      { name:'Chlef', nameAr:'الشلف', lat:36.1653, lng:1.3338 },
      { name:'Ténès', nameAr:'تنس', lat:36.5167, lng:1.3333 },
      { name:'El Karimia', nameAr:'الكريمية', lat:36.0333, lng:1.1333 },
      { name:'Boukadir', nameAr:'بوقدير', lat:36.0667, lng:1.1167 },
    ]
  },
  // ── WILAYA 03 ────────────────────────────────────────────────────────────
  { code:'03', name:'Laghouat', nameAr:'الأغواط', nameFr:'Laghouat', type:'wilaya', lat:33.8000, lng:2.8833,
    aliases:['اغواط','الاغواط','laghouat'],
    communes:[
      { name:'Laghouat', nameAr:'الأغواط', lat:33.8000, lng:2.8833 },
      { name:'Aflou', nameAr:'أفلو', lat:34.1167, lng:2.1000 },
      { name:'Hassi R\'Mel', nameAr:'حاسي الرمل', lat:32.9333, lng:3.2667 },
      { name:'Ksar El Hirane', nameAr:'قصر الحيران', lat:33.7833, lng:3.1333 },
    ]
  },
  // ── WILAYA 04 ────────────────────────────────────────────────────────────
  { code:'04', name:'Oum El Bouaghi', nameAr:'أم البواقي', nameFr:'Oum El Bouaghi', type:'wilaya', lat:35.8833, lng:7.1167,
    aliases:['ام البواقي','أم البواقي','oum el bouaghi','umm al bawaghi'],
    communes:[
      { name:'Oum El Bouaghi', nameAr:'أم البواقي', lat:35.8833, lng:7.1167 },
      { name:'Aïn Beïda', nameAr:'عين البيضاء', lat:35.7944, lng:7.3917 },
      { name:'Aïn M\'lila', nameAr:'عين مليلة', lat:36.0333, lng:6.5667 },
      { name:'Sigus', nameAr:'سيقوس', lat:36.0000, lng:6.7667 },
    ]
  },
  // ── WILAYA 05 ────────────────────────────────────────────────────────────
  { code:'05', name:'Batna', nameAr:'باتنة', nameFr:'Batna', type:'wilaya', lat:35.5553, lng:6.1742,
    aliases:['باتنة','batna'],
    communes:[
      { name:'Batna', nameAr:'باتنة', lat:35.5553, lng:6.1742 },
      { name:'Barika', nameAr:'بريكة', lat:35.3833, lng:5.3667 },
      { name:'Aïn Touta', nameAr:'عين التوتة', lat:35.3667, lng:5.8833 },
      { name:'Arris', nameAr:'آريس', lat:35.2167, lng:6.3833 },
      { name:'Timgad', nameAr:'تيمقاد', lat:35.4847, lng:6.4681 },
      { name:'Merouana', nameAr:'مروانة', lat:35.6333, lng:5.9500 },
    ]
  },
  // ── WILAYA 06 ────────────────────────────────────────────────────────────
  { code:'06', name:'Béjaïa', nameAr:'بجاية', nameFr:'Béjaïa', type:'wilaya', lat:36.7539, lng:5.0564,
    aliases:['بجاية','béjaïa','bejaia','bgayet'],
    communes:[
      { name:'Béjaïa', nameAr:'بجاية', lat:36.7539, lng:5.0564 },
      { name:'Akbou', nameAr:'أقبو', lat:36.4667, lng:4.5167 },
      { name:'Amizour', nameAr:'أميزور', lat:36.6500, lng:5.2333 },
      { name:'Barbacha', nameAr:'بربارش', lat:36.5667, lng:5.1667 },
      { name:'El Kseur', nameAr:'القصر', lat:36.6833, lng:4.8500 },
      { name:'Sidi Aïch', nameAr:'سيدي عيش', lat:36.6000, lng:4.7000 },
      { name:'Tazmalt', nameAr:'تازمالت', lat:36.3833, lng:4.5333 },
    ]
  },
  // ── WILAYA 07 ────────────────────────────────────────────────────────────
  { code:'07', name:'Biskra', nameAr:'بسكرة', nameFr:'Biskra', type:'wilaya', lat:34.8500, lng:5.7333,
    aliases:['بسكرة','biskra'],
    communes:[
      { name:'Biskra', nameAr:'بسكرة', lat:34.8500, lng:5.7333 },
      { name:'Tolga', nameAr:'طولقة', lat:34.7222, lng:5.3778 },
      { name:'Ouled Djellal', nameAr:'أولاد جلال', lat:34.4167, lng:5.0667 },
      { name:'Sidi Khaled', nameAr:'سيدي خالد', lat:34.3500, lng:4.9833 },
      { name:'Zeribet El Oued', nameAr:'زريبة الوادي', lat:34.7000, lng:6.5333 },
      { name:'El Outaya', nameAr:'القنطرة', lat:35.1500, lng:5.9167 },
    ]
  },
  // ── WILAYA 08 ────────────────────────────────────────────────────────────
  { code:'08', name:'Béchar', nameAr:'بشار', nameFr:'Béchar', type:'wilaya', lat:31.6167, lng:-2.2167,
    aliases:['بشار','bechar','béchar'],
    communes:[
      { name:'Béchar', nameAr:'بشار', lat:31.6167, lng:-2.2167 },
      { name:'Kenadsa', nameAr:'قنادسة', lat:31.5500, lng:-2.4167 },
      { name:'Abadla', nameAr:'عبادلة', lat:31.0167, lng:-2.7333 },
      { name:'Igli', nameAr:'إيقلي', lat:30.4500, lng:-2.2333 },
    ]
  },
  // ── WILAYA 09 ────────────────────────────────────────────────────────────
  { code:'09', name:'Blida', nameAr:'البليدة', nameFr:'Blida', type:'wilaya', lat:36.4700, lng:2.8278,
    aliases:['بليدة','البليدة','blida'],
    communes:[
      { name:'Blida', nameAr:'البليدة', lat:36.4700, lng:2.8278 },
      { name:'Boufarik', nameAr:'بوفاريك', lat:36.5667, lng:2.9167 },
      { name:'Larbaa', nameAr:'لاربعاء', lat:36.5500, lng:3.1667 },
      { name:'Meftah', nameAr:'مفتاح', lat:36.6167, lng:3.2167 },
      { name:'Bougara', nameAr:'بوقرة', lat:36.5167, lng:3.0833 },
      { name:'Chréa', nameAr:'شريعة', lat:36.4333, lng:2.8833 },
    ]
  },
  // ── WILAYA 10 ────────────────────────────────────────────────────────────
  { code:'10', name:'Bouira', nameAr:'البويرة', nameFr:'Bouira', type:'wilaya', lat:36.3742, lng:3.9019,
    aliases:['بويرة','البويرة','bouira'],
    communes:[
      { name:'Bouira', nameAr:'البويرة', lat:36.3742, lng:3.9019 },
      { name:'Lakhdaria', nameAr:'لخضارية', lat:36.5667, lng:3.5833 },
      { name:'Sour El Ghozlane', nameAr:'سور الغزلان', lat:36.1667, lng:3.6833 },
      { name:'M\'Chedallah', nameAr:'مشدالة', lat:36.3667, lng:3.7667 },
    ]
  },
  // ── WILAYA 11 ────────────────────────────────────────────────────────────
  { code:'11', name:'Tamanrasset', nameAr:'تمنراست', nameFr:'Tamanrasset', type:'wilaya', lat:22.7906, lng:5.5228,
    aliases:['تمنغست','تمنراست','tamanrasset','tamanghasset'],
    communes:[
      { name:'Tamanrasset', nameAr:'تمنراست', lat:22.7906, lng:5.5228 },
      { name:'Abalessa', nameAr:'أبلسة', lat:22.9833, lng:4.8500 },
      { name:'In Salah', nameAr:'عين صالح', lat:27.1978, lng:2.4797 },
      { name:'In Guezzam', nameAr:'عين قزام', lat:19.5667, lng:5.7667 },
    ]
  },
  // ── WILAYA 12 ────────────────────────────────────────────────────────────
  { code:'12', name:'Tébessa', nameAr:'تبسة', nameFr:'Tébessa', type:'wilaya', lat:35.4042, lng:8.1247,
    aliases:['تبسة','tebessa','tébessa'],
    communes:[
      { name:'Tébessa', nameAr:'تبسة', lat:35.4042, lng:8.1247 },
      { name:'El Aouinet', nameAr:'العوينات', lat:35.8667, lng:8.0000 },
      { name:'Bir El Ater', nameAr:'بئر العاتر', lat:34.7333, lng:7.9333 },
      { name:'Cheria', nameAr:'شريعة', lat:35.2667, lng:7.3833 },
    ]
  },
  // ── WILAYA 13 ────────────────────────────────────────────────────────────
  { code:'13', name:'Tlemcen', nameAr:'تلمسان', nameFr:'Tlemcen', type:'wilaya', lat:34.8833, lng:-1.3167,
    aliases:['تلمسان','tlemcen','tilimsen'],
    communes:[
      { name:'Tlemcen', nameAr:'تلمسان', lat:34.8833, lng:-1.3167 },
      { name:'Maghnia', nameAr:'مغنية', lat:34.8667, lng:-1.7333 },
      { name:'Remchi', nameAr:'رمشي', lat:35.0667, lng:-1.4333 },
      { name:'Ghazaouet', nameAr:'الغزوات', lat:35.1000, lng:-1.8667 },
      { name:'Nedroma', nameAr:'ندرومة', lat:35.0167, lng:-1.7500 },
      { name:'Bab El Assa', nameAr:'باب العسة', lat:34.8000, lng:-2.0167 },
    ]
  },
  // ── WILAYA 14 ────────────────────────────────────────────────────────────
  { code:'14', name:'Tiaret', nameAr:'تيارت', nameFr:'Tiaret', type:'wilaya', lat:35.3713, lng:1.3217,
    aliases:['تيارت','tiaret'],
    communes:[
      { name:'Tiaret', nameAr:'تيارت', lat:35.3713, lng:1.3217 },
      { name:'Frenda', nameAr:'فرندة', lat:35.0667, lng:1.0500 },
      { name:'Mehdia', nameAr:'مهدية', lat:35.2167, lng:1.8000 },
      { name:'Sougueur', nameAr:'سوقر', lat:35.1833, lng:1.4833 },
    ]
  },
  // ── WILAYA 15 ────────────────────────────────────────────────────────────
  { code:'15', name:'Tizi Ouzou', nameAr:'تيزي وزو', nameFr:'Tizi Ouzou', type:'wilaya', lat:36.7170, lng:4.0465,
    aliases:['تيزي وزو','تيزي أوزو','tizi ouzou','tizi-ouzou'],
    communes:[
      { name:'Tizi Ouzou', nameAr:'تيزي وزو', lat:36.7170, lng:4.0465 },
      { name:'Azazga', nameAr:'عزازقة', lat:36.7500, lng:4.3667 },
      { name:'Tigzirt', nameAr:'تيقزيرت', lat:36.8917, lng:4.1167 },
      { name:'Draa Ben Khedda', nameAr:'ذراع بن خدة', lat:36.7333, lng:3.9500 },
      { name:'Boghni', nameAr:'بوغني', lat:36.5333, lng:3.9500 },
      { name:'Larbaa Nath Irathen', nameAr:'أربعاء ناث إيراثن', lat:36.6833, lng:4.2000 },
    ]
  },
  // ── WILAYA 16 ────────────────────────────────────────────────────────────
  { code:'16', name:'Alger', nameAr:'الجزائر', nameFr:'Alger', type:'wilaya', lat:36.7372, lng:3.0865,
    aliases:['الجزائر العاصمة','الجزائر','alger','algiers','dzair'],
    communes:[
      { name:'Alger Centre', nameAr:'وسط الجزائر', lat:36.7372, lng:3.0865 },
      { name:'Bab El Oued', nameAr:'باب الواد', lat:36.7833, lng:3.0500 },
      { name:'Hussein Dey', nameAr:'حسين داي', lat:36.7333, lng:3.1333 },
      { name:'El Harrach', nameAr:'الحراش', lat:36.7167, lng:3.1500 },
      { name:'Bir Mourad Raïs', nameAr:'بئر مراد رايس', lat:36.7167, lng:3.0500 },
      { name:'Birkhadem', nameAr:'بئر خادم', lat:36.7000, lng:3.0500 },
      { name:'Kouba', nameAr:'القبة', lat:36.7333, lng:3.1167 },
      { name:'Dar El Beïda', nameAr:'الدار البيضاء', lat:36.7167, lng:3.2167 },
      { name:'Draria', nameAr:'الدرارية', lat:36.6833, lng:2.9667 },
      { name:'Cheraga', nameAr:'شراقة', lat:36.7667, lng:2.9667 },
    ]
  },
  // ── WILAYA 17 ────────────────────────────────────────────────────────────
  { code:'17', name:'Djelfa', nameAr:'الجلفة', nameFr:'Djelfa', type:'wilaya', lat:34.6706, lng:3.2631,
    aliases:['جلفة','الجلفة','djelfa'],
    communes:[
      { name:'Djelfa', nameAr:'الجلفة', lat:34.6706, lng:3.2631 },
      { name:'Aïn Oussera', nameAr:'عين وسارة', lat:35.4500, lng:2.9000 },
      { name:'Birine', nameAr:'بيرين', lat:35.6333, lng:3.2333 },
      { name:'Dar Chioukh', nameAr:'دار شيوخ', lat:34.4167, lng:3.0500 },
    ]
  },
  // ── WILAYA 18 ────────────────────────────────────────────────────────────
  { code:'18', name:'Jijel', nameAr:'جيجل', nameFr:'Jijel', type:'wilaya', lat:36.8186, lng:5.7660,
    aliases:['جيجل','jijel'],
    communes:[
      { name:'Jijel', nameAr:'جيجل', lat:36.8186, lng:5.7660 },
      { name:'El Milia', nameAr:'الميلية', lat:36.7500, lng:6.2667 },
      { name:'Taher', nameAr:'الطاهير', lat:36.7667, lng:5.9000 },
      { name:'Chekfa', nameAr:'شقفة', lat:36.7333, lng:5.9333 },
    ]
  },
  // ── WILAYA 19 ────────────────────────────────────────────────────────────
  { code:'19', name:'Sétif', nameAr:'سطيف', nameFr:'Sétif', type:'wilaya', lat:36.1911, lng:5.4131,
    aliases:['سطيف','setif','sétif'],
    communes:[
      { name:'Sétif', nameAr:'سطيف', lat:36.1911, lng:5.4131 },
      { name:'El Eulma', nameAr:'العلمة', lat:36.1500, lng:5.6833 },
      { name:'Aïn Oulmène', nameAr:'عين ولمان', lat:35.9167, lng:5.3000 },
      { name:'Bougaa', nameAr:'بوقاعة', lat:36.3333, lng:5.0833 },
      { name:'Guenzet', nameAr:'قنزات', lat:36.3667, lng:4.9167 },
    ]
  },
  // ── WILAYA 20 ────────────────────────────────────────────────────────────
  { code:'20', name:'Saïda', nameAr:'سعيدة', nameFr:'Saïda', type:'wilaya', lat:34.8317, lng:0.1500,
    aliases:['سعيدة','saida','saïda'],
    communes:[
      { name:'Saïda', nameAr:'سعيدة', lat:34.8317, lng:0.1500 },
      { name:'Aïn El Hadjar', nameAr:'عين الحجر', lat:34.9500, lng:-0.0167 },
      { name:'Youb', nameAr:'يوب', lat:34.7667, lng:0.1000 },
    ]
  },
  // ── WILAYA 21 ────────────────────────────────────────────────────────────
  { code:'21', name:'Skikda', nameAr:'سكيكدة', nameFr:'Skikda', type:'wilaya', lat:36.8765, lng:6.9062,
    aliases:['سكيكدة','skikda','philippeville'],
    communes:[
      { name:'Skikda', nameAr:'سكيكدة', lat:36.8765, lng:6.9062 },
      { name:'Collo', nameAr:'القل', lat:37.0000, lng:6.5500 },
      { name:'El Harrouch', nameAr:'الحروش', lat:36.7000, lng:6.8833 },
      { name:'Tamalous', nameAr:'تمالوس', lat:36.8833, lng:6.6333 },
    ]
  },
  // ── WILAYA 22 ────────────────────────────────────────────────────────────
  { code:'22', name:'Sidi Bel Abbès', nameAr:'سيدي بلعباس', nameFr:'Sidi Bel Abbès', type:'wilaya', lat:35.2028, lng:-0.6333,
    aliases:['سيدي بلعباس','sidi bel abbes','sidi bel abbès'],
    communes:[
      { name:'Sidi Bel Abbès', nameAr:'سيدي بلعباس', lat:35.2028, lng:-0.6333 },
      { name:'Telagh', nameAr:'تلاغ', lat:34.7833, lng:-0.5667 },
      { name:'Ras El Ma', nameAr:'رأس الماء', lat:34.4833, lng:-0.8333 },
      { name:'Sfisef', nameAr:'سفيزف', lat:35.4833, lng:-0.4667 },
    ]
  },
  // ── WILAYA 23 ────────────────────────────────────────────────────────────
  { code:'23', name:'Annaba', nameAr:'عنابة', nameFr:'Annaba', type:'wilaya', lat:36.9000, lng:7.7667,
    aliases:['عنابة','annaba','bône'],
    communes:[
      { name:'Annaba', nameAr:'عنابة', lat:36.9000, lng:7.7667 },
      { name:'El Hadjar', nameAr:'الحجار', lat:36.8167, lng:7.7167 },
      { name:'Berrahal', nameAr:'برحال', lat:36.8667, lng:7.5500 },
      { name:'Aïn Berda', nameAr:'عين بردة', lat:36.6500, lng:7.6000 },
    ]
  },
  // ── WILAYA 24 ────────────────────────────────────────────────────────────
  { code:'24', name:'Guelma', nameAr:'قالمة', nameFr:'Guelma', type:'wilaya', lat:36.4611, lng:7.4272,
    aliases:['قالمة','guelma'],
    communes:[
      { name:'Guelma', nameAr:'قالمة', lat:36.4611, lng:7.4272 },
      { name:'Bouchegouf', nameAr:'بوشقوف', lat:36.4667, lng:7.7333 },
      { name:'Héliopolis', nameAr:'حليوبوليس', lat:36.5500, lng:7.4667 },
      { name:'Aïn Makhlouf', nameAr:'عين مخلوف', lat:36.2167, lng:7.2500 },
    ]
  },
  // ── WILAYA 25 ────────────────────────────────────────────────────────────
  { code:'25', name:'Constantine', nameAr:'قسنطينة', nameFr:'Constantine', type:'wilaya', lat:36.3650, lng:6.6147,
    aliases:['قسنطينة','constantine','ksantina'],
    communes:[
      { name:'Constantine', nameAr:'قسنطينة', lat:36.3650, lng:6.6147 },
      { name:'El Khroub', nameAr:'الخروب', lat:36.2667, lng:6.7000 },
      { name:'Aïn Smara', nameAr:'عين سمارة', lat:36.2000, lng:6.5500 },
      { name:'Hamma Bouziane', nameAr:'حامة بوزيان', lat:36.4500, lng:6.5500 },
    ]
  },
  // ── WILAYA 26 ────────────────────────────────────────────────────────────
  { code:'26', name:'Médéa', nameAr:'المدية', nameFr:'Médéa', type:'wilaya', lat:36.2679, lng:2.7528,
    aliases:['مدية','المدية','medea','médéa'],
    communes:[
      { name:'Médéa', nameAr:'المدية', lat:36.2679, lng:2.7528 },
      { name:'Berrouaghia', nameAr:'بررواغية', lat:36.1333, lng:2.9167 },
      { name:'Ksar El Boukhari', nameAr:'قصر البخاري', lat:35.8833, lng:2.7500 },
      { name:'Tablat', nameAr:'تابلاط', lat:36.4000, lng:3.3167 },
    ]
  },
  // ── WILAYA 27 ────────────────────────────────────────────────────────────
  { code:'27', name:'Mostaganem', nameAr:'مستغانم', nameFr:'Mostaganem', type:'wilaya', lat:35.9312, lng:0.0892,
    aliases:['مستغانم','mostaganem'],
    communes:[
      { name:'Mostaganem', nameAr:'مستغانم', lat:35.9312, lng:0.0892 },
      { name:'Aïn Tedles', nameAr:'عين التدلس', lat:36.1833, lng:0.2667 },
      { name:'Sidi Ali', nameAr:'سيدي علي', lat:36.1000, lng:0.4167 },
      { name:'Kheir Eddine', nameAr:'خير الدين', lat:35.8500, lng:-0.0500 },
    ]
  },
  // ── WILAYA 28 ────────────────────────────────────────────────────────────
  { code:'28', name:'M\'Sila', nameAr:'المسيلة', nameFr:'M\'Sila', type:'wilaya', lat:35.7056, lng:4.5444,
    aliases:['مسيلة','المسيلة','msila','m\'sila'],
    communes:[
      { name:'M\'Sila', nameAr:'المسيلة', lat:35.7056, lng:4.5444 },
      { name:'Bou Saâda', nameAr:'بوسعادة', lat:35.2100, lng:4.1789 },
      { name:'Sidi Aïssa', nameAr:'سيدي عيسى', lat:35.8667, lng:3.8667 },
      { name:'Aïn El Melh', nameAr:'عين الملح', lat:34.8333, lng:4.1667 },
    ]
  },
  // ── WILAYA 29 ────────────────────────────────────────────────────────────
  { code:'29', name:'Mascara', nameAr:'معسكر', nameFr:'Mascara', type:'wilaya', lat:35.3955, lng:0.1400,
    aliases:['معسكر','mascara'],
    communes:[
      { name:'Mascara', nameAr:'معسكر', lat:35.3955, lng:0.1400 },
      { name:'Sig', nameAr:'سيق', lat:35.5333, lng:-0.1833 },
      { name:'Tighennif', nameAr:'تيغنيف', lat:35.4667, lng:0.3167 },
      { name:'Bouhanifia', nameAr:'بوهنيفة', lat:35.3000, lng:0.0500 },
    ]
  },
  // ── WILAYA 30 ────────────────────────────────────────────────────────────
  { code:'30', name:'Ouargla', nameAr:'ورقلة', nameFr:'Ouargla', type:'wilaya', lat:31.9497, lng:5.3244,
    aliases:['ورقلة','ouargla','wargla'],
    communes:[
      { name:'Ouargla', nameAr:'ورقلة', lat:31.9497, lng:5.3244 },
      { name:'Hassi Messaoud', nameAr:'حاسي مسعود', lat:31.6997, lng:6.0561 },
      { name:'Touggourt', nameAr:'تقرت', lat:33.1000, lng:6.0667 },
      { name:'El Hadjira', nameAr:'الحجيرة', lat:32.3833, lng:5.5167 },
      { name:'Rouissat', nameAr:'الرويسات', lat:31.9333, lng:5.3500 },
    ]
  },
  // ── WILAYA 31 ────────────────────────────────────────────────────────────
  { code:'31', name:'Oran', nameAr:'وهران', nameFr:'Oran', type:'wilaya', lat:35.6987, lng:-0.6349,
    aliases:['وهران','oran','wahran'],
    communes:[
      { name:'Oran', nameAr:'وهران', lat:35.6987, lng:-0.6349 },
      { name:'Bir El Djir', nameAr:'بئر الجير', lat:35.7333, lng:-0.5500 },
      { name:'Arzew', nameAr:'أرزيو', lat:35.8333, lng:-0.3167 },
      { name:'Es Sénia', nameAr:'السانية', lat:35.6500, lng:-0.6000 },
      { name:'Bethioua', nameAr:'بطيوة', lat:35.7833, lng:-0.2833 },
      { name:'Aïn El Turk', nameAr:'عين الترك', lat:35.7333, lng:-0.7667 },
    ]
  },
  // ── WILAYA 32 ────────────────────────────────────────────────────────────
  { code:'32', name:'El Bayadh', nameAr:'البيض', nameFr:'El Bayadh', type:'wilaya', lat:33.6900, lng:1.0042,
    aliases:['البيض','el bayadh'],
    communes:[
      { name:'El Bayadh', nameAr:'البيض', lat:33.6900, lng:1.0042 },
      { name:'Rogassa', nameAr:'روقاصة', lat:33.9167, lng:0.8500 },
      { name:'Boualem', nameAr:'بوعلام', lat:33.6333, lng:1.3833 },
    ]
  },
  // ── WILAYA 33 ────────────────────────────────────────────────────────────
  { code:'33', name:'Illizi', nameAr:'إليزي', nameFr:'Illizi', type:'wilaya', lat:26.4847, lng:8.4842,
    aliases:['إليزي','ايليزي','illizi'],
    communes:[
      { name:'Illizi', nameAr:'إليزي', lat:26.4847, lng:8.4842 },
      { name:'Djanet', nameAr:'جانت', lat:24.5553, lng:9.4858 },
      { name:'In Amenas', nameAr:'عين أمناس', lat:28.0514, lng:9.5525 },
    ]
  },
  // ── WILAYA 34 ────────────────────────────────────────────────────────────
  { code:'34', name:'Bordj Bou Arréridj', nameAr:'برج بوعريريج', nameFr:'Bordj Bou Arréridj', type:'wilaya', lat:36.0703, lng:4.7630,
    aliases:['برج بوعريريج','bordj bou arreridj','bba'],
    communes:[
      { name:'Bordj Bou Arréridj', nameAr:'برج بوعريريج', lat:36.0703, lng:4.7630 },
      { name:'Ras El Oued', nameAr:'رأس الوادي', lat:35.9500, lng:5.0333 },
      { name:'El Anseur', nameAr:'الأنصار', lat:36.2000, lng:4.5333 },
      { name:'Bordj Ghdir', nameAr:'برج غدير', lat:35.8667, lng:4.9667 },
    ]
  },
  // ── WILAYA 35 ────────────────────────────────────────────────────────────
  { code:'35', name:'Boumerdès', nameAr:'بومرداس', nameFr:'Boumerdès', type:'wilaya', lat:36.7645, lng:3.4776,
    aliases:['بومرداس','boumerdes','boumerdès'],
    communes:[
      { name:'Boumerdès', nameAr:'بومرداس', lat:36.7645, lng:3.4776 },
      { name:'Tidjelabine', nameAr:'تيجلابين', lat:36.7333, lng:3.5667 },
      { name:'Dellys', nameAr:'دلس', lat:36.9167, lng:3.9000 },
      { name:'Boudouaou', nameAr:'بودواو', lat:36.7333, lng:3.4167 },
      { name:'Khemis El Khechna', nameAr:'خميس الخشنة', lat:36.6500, lng:3.3333 },
      { name:'Naciria', nameAr:'ناسيرية', lat:36.8167, lng:3.8000 },
    ]
  },
  // ── WILAYA 36 ────────────────────────────────────────────────────────────
  { code:'36', name:'El Tarf', nameAr:'الطارف', nameFr:'El Tarf', type:'wilaya', lat:36.7667, lng:8.3167,
    aliases:['الطارف','el tarf'],
    communes:[
      { name:'El Tarf', nameAr:'الطارف', lat:36.7667, lng:8.3167 },
      { name:'Ben M\'hidi', nameAr:'بن مهيدي', lat:36.8667, lng:8.0833 },
      { name:'Besbes', nameAr:'البسباس', lat:36.7000, lng:7.9500 },
      { name:'Bouteldja', nameAr:'بوتلجة', lat:36.8667, lng:8.4333 },
    ]
  },
  // ── WILAYA 37 ────────────────────────────────────────────────────────────
  { code:'37', name:'Tindouf', nameAr:'تندوف', nameFr:'Tindouf', type:'wilaya', lat:27.8000, lng:-8.1500,
    aliases:['تندوف','tindouf'],
    communes:[
      { name:'Tindouf', nameAr:'تندوف', lat:27.8000, lng:-8.1500 },
    ]
  },
  // ── WILAYA 38 ────────────────────────────────────────────────────────────
  { code:'38', name:'Tissemsilt', nameAr:'تيسمسيلت', nameFr:'Tissemsilt', type:'wilaya', lat:35.6070, lng:1.8073,
    aliases:['تيسمسيلت','tissemsilt'],
    communes:[
      { name:'Tissemsilt', nameAr:'تيسمسيلت', lat:35.6070, lng:1.8073 },
      { name:'Bordj Emir Abdelkader', nameAr:'برج الأمير عبد القادر', lat:35.7500, lng:1.6833 },
      { name:'Lazharia', nameAr:'لجواهرية', lat:35.6333, lng:2.1500 },
    ]
  },
  // ── WILAYA 39 ────────────────────────────────────────────────────────────
  { code:'39', name:'El Oued', nameAr:'الوادي', nameFr:'El Oued', type:'wilaya', lat:33.3683, lng:6.8670,
    aliases:['الوادي','واد سوف','el oued','oued souf','souf'],
    communes:[
      { name:'El Oued', nameAr:'الوادي', lat:33.3683, lng:6.8670 },
      { name:'Guemar', nameAr:'قمار', lat:33.4667, lng:6.7833 },
      { name:'Robbah', nameAr:'الرباح', lat:33.2500, lng:6.8833 },
      { name:'Reguiba', nameAr:'الرقيبة', lat:33.5500, lng:6.6167 },
      { name:'Hassi Khalifa', nameAr:'حاسي خليفة', lat:32.9500, lng:6.8667 },
      { name:'Kouinine', nameAr:'قوينين', lat:33.2833, lng:6.9000 },
      { name:'Bayadha', nameAr:'البياضة', lat:33.6833, lng:7.1500 },
    ]
  },
  // ── WILAYA 40 ────────────────────────────────────────────────────────────
  { code:'40', name:'Khenchela', nameAr:'خنشلة', nameFr:'Khenchela', type:'wilaya', lat:35.4333, lng:7.1500,
    aliases:['خنشلة','khenchela'],
    communes:[
      { name:'Khenchela', nameAr:'خنشلة', lat:35.4333, lng:7.1500 },
      { name:'Aïn Touila', nameAr:'عين توالة', lat:35.3833, lng:7.3500 },
      { name:'Bouhmama', nameAr:'بوحماما', lat:35.3333, lng:6.8167 },
    ]
  },
  // ── WILAYA 41 ────────────────────────────────────────────────────────────
  { code:'41', name:'Souk Ahras', nameAr:'سوق أهراس', nameFr:'Souk Ahras', type:'wilaya', lat:36.2861, lng:7.9514,
    aliases:['سوق أهراس','سوق اهراس','souk ahras'],
    communes:[
      { name:'Souk Ahras', nameAr:'سوق أهراس', lat:36.2861, lng:7.9514 },
      { name:'Mechroha', nameAr:'مشروحة', lat:36.5333, lng:7.8833 },
      { name:'Sedrata', nameAr:'سدراتة', lat:36.1167, lng:7.6833 },
      { name:'Ouled Driss', nameAr:'أولاد إدريس', lat:36.1833, lng:8.0167 },
    ]
  },
  // ── WILAYA 42 ────────────────────────────────────────────────────────────
  { code:'42', name:'Tipaza', nameAr:'تيبازة', nameFr:'Tipaza', type:'wilaya', lat:36.5892, lng:2.4478,
    aliases:['تيبازة','tipasa','tipaza'],
    communes:[
      { name:'Tipaza', nameAr:'تيبازة', lat:36.5892, lng:2.4478 },
      { name:'Koléa', nameAr:'قليعة', lat:36.6333, lng:2.7667 },
      { name:'Hadjout', nameAr:'حجوط', lat:36.5000, lng:2.5167 },
      { name:'Aïn Tagourait', nameAr:'عين تقورايت', lat:36.5000, lng:2.3333 },
      { name:'Cherchell', nameAr:'شرشال', lat:36.6000, lng:2.1833 },
    ]
  },
  // ── WILAYA 43 ────────────────────────────────────────────────────────────
  { code:'43', name:'Mila', nameAr:'ميلة', nameFr:'Mila', type:'wilaya', lat:36.4500, lng:6.2667,
    aliases:['ميلة','mila'],
    communes:[
      { name:'Mila', nameAr:'ميلة', lat:36.4500, lng:6.2667 },
      { name:'Ferdjioua', nameAr:'فرجيوة', lat:36.4000, lng:5.9833 },
      { name:'Chelghoum Laïd', nameAr:'شلغوم العيد', lat:36.1667, lng:6.1667 },
      { name:'Tadjenanet', nameAr:'تاجنانت', lat:36.0667, lng:5.9833 },
    ]
  },
  // ── WILAYA 44 ────────────────────────────────────────────────────────────
  { code:'44', name:'Aïn Defla', nameAr:'عين الدفلى', nameFr:'Aïn Defla', type:'wilaya', lat:36.2638, lng:1.9658,
    aliases:['عين الدفلى','ain defla','aïn defla'],
    communes:[
      { name:'Aïn Defla', nameAr:'عين الدفلى', lat:36.2638, lng:1.9658 },
      { name:'Khemis Miliana', nameAr:'خميس مليانة', lat:36.2667, lng:2.2167 },
      { name:'El Attaf', nameAr:'العطاف', lat:36.2167, lng:1.7500 },
      { name:'Aïn Lechiakh', nameAr:'عين الشياخ', lat:36.3500, lng:2.1500 },
    ]
  },
  // ── WILAYA 45 ────────────────────────────────────────────────────────────
  { code:'45', name:'Naâma', nameAr:'النعامة', nameFr:'Naâma', type:'wilaya', lat:33.2667, lng:-0.3167,
    aliases:['نعامة','النعامة','naama','naâma'],
    communes:[
      { name:'Naâma', nameAr:'النعامة', lat:33.2667, lng:-0.3167 },
      { name:'Mecheria', nameAr:'المشرية', lat:33.5500, lng:-0.2833 },
      { name:'Aïn Sefra', nameAr:'عين الصفراء', lat:32.7500, lng:-0.5667 },
      { name:'Tiout', nameAr:'تيوت', lat:33.2000, lng:-0.5833 },
    ]
  },
  // ── WILAYA 46 ────────────────────────────────────────────────────────────
  { code:'46', name:'Aïn Témouchent', nameAr:'عين تموشنت', nameFr:'Aïn Témouchent', type:'wilaya', lat:35.2959, lng:-1.1392,
    aliases:['عين تموشنت','ain temouchent','aïn témouchent'],
    communes:[
      { name:'Aïn Témouchent', nameAr:'عين تموشنت', lat:35.2959, lng:-1.1392 },
      { name:'Hammam Bouhadjar', nameAr:'حمام بوحجر', lat:35.3833, lng:-0.9667 },
      { name:'Beni Saf', nameAr:'بني صاف', lat:35.3000, lng:-1.3667 },
      { name:'El Malah', nameAr:'الملاح', lat:35.4333, lng:-1.1000 },
    ]
  },
  // ── WILAYA 47 ────────────────────────────────────────────────────────────
  { code:'47', name:'Ghardaïa', nameAr:'غرداية', nameFr:'Ghardaïa', type:'wilaya', lat:32.4912, lng:3.6740,
    aliases:['غرداية','ghardaia','ghardaïa','غردايا'],
    communes:[
      { name:'Ghardaïa', nameAr:'غرداية', lat:32.4912, lng:3.6740 },
      { name:'Metlili', nameAr:'متليلي', lat:32.2667, lng:3.6167 },
      { name:'El Guerrara', nameAr:'القرارة', lat:32.7833, lng:4.3833 },
      { name:'Berriane', nameAr:'برّيان', lat:32.8333, lng:3.7667 },
      { name:'Daya Ben Dahoua', nameAr:'ضاية بن ضحوة', lat:32.4500, lng:3.5333 },
    ]
  },
  // ── WILAYA 48 ────────────────────────────────────────────────────────────
  { code:'48', name:'Relizane', nameAr:'غليزان', nameFr:'Relizane', type:'wilaya', lat:35.9656, lng:0.5469,
    aliases:['غليزان','relizane','relizan'],
    communes:[
      { name:'Relizane', nameAr:'غليزان', lat:35.9656, lng:0.5469 },
      { name:'Aïn Tarek', nameAr:'عين التارق', lat:35.8667, lng:0.3000 },
      { name:'Mazouna', nameAr:'مزونة', lat:36.0167, lng:0.7333 },
      { name:'Oued Rhiou', nameAr:'واد رهيو', lat:35.9500, lng:0.9000 },
    ]
  },
  // ── WILAYA 49 — TIMIMOUN ─────────────────────────────────────────────────
  { code:'49', name:'Timimoun', nameAr:'تيميمون', nameFr:'Timimoun', type:'wilaya', lat:29.2639, lng:0.2369,
    aliases:['تيميمون','timimoun'],
    communes:[
      { name:'Timimoun', nameAr:'تيميمون', lat:29.2639, lng:0.2369 },
      { name:'Aougrout', nameAr:'أوقروت', lat:28.5500, lng:0.5500 },
    ]
  },
  // ── WILAYA 50 — BORDJ BADJI MOKHTAR ─────────────────────────────────────
  { code:'50', name:'Bordj Badji Mokhtar', nameAr:'برج باجي مختار', nameFr:'Bordj Badji Mokhtar', type:'wilaya', lat:21.3289, lng:0.9453,
    aliases:['برج باجي مختار','bordj badji mokhtar'],
    communes:[
      { name:'Bordj Badji Mokhtar', nameAr:'برج باجي مختار', lat:21.3289, lng:0.9453 },
    ]
  },
  // ── WILAYA 51 — OULED DJELLAL ────────────────────────────────────────────
  { code:'51', name:'Ouled Djellal', nameAr:'أولاد جلال', nameFr:'Ouled Djellal', type:'wilaya', lat:34.4167, lng:5.0667,
    aliases:['اولاد جلال','أولاد جلال','ouled djellal'],
    communes:[
      { name:'Ouled Djellal', nameAr:'أولاد جلال', lat:34.4167, lng:5.0667 },
      { name:'Sidi Khaled', nameAr:'سيدي خالد', lat:34.3500, lng:4.9833 },
    ]
  },
  // ── WILAYA 52 — BÉNI ABBÈS ───────────────────────────────────────────────
  { code:'52', name:'Béni Abbès', nameAr:'بني عباس', nameFr:'Béni Abbès', type:'wilaya', lat:30.1311, lng:-2.1631,
    aliases:['بني عباس','beni abbes','béni abbès'],
    communes:[
      { name:'Béni Abbès', nameAr:'بني عباس', lat:30.1311, lng:-2.1631 },
      { name:'Tamtert', nameAr:'تمترت', lat:29.8167, lng:-2.4833 },
    ]
  },
  // ── WILAYA 53 — IN SALAH ─────────────────────────────────────────────────
  { code:'53', name:'In Salah', nameAr:'عين صالح', nameFr:'In Salah', type:'wilaya', lat:27.1978, lng:2.4797,
    aliases:['عين صالح','ان صالح','in salah','insalah'],
    communes:[
      { name:'In Salah', nameAr:'عين صالح', lat:27.1978, lng:2.4797 },
      { name:'Foggaret Ez Zoua', nameAr:'فقارة الزوى', lat:27.1667, lng:2.7167 },
    ]
  },
  // ── WILAYA 54 — IN GUEZZAM ───────────────────────────────────────────────
  { code:'54', name:'In Guezzam', nameAr:'عين قزام', nameFr:'In Guezzam', type:'wilaya', lat:19.5667, lng:5.7667,
    aliases:['عين قزام','in guezzam'],
    communes:[
      { name:'In Guezzam', nameAr:'عين قزام', lat:19.5667, lng:5.7667 },
      { name:'Tin Zaouatine', nameAr:'تين زواتين', lat:19.9333, lng:2.9500 },
    ]
  },
  // ── WILAYA 55 — TOUGGOURT ────────────────────────────────────────────────
  { code:'55', name:'Touggourt', nameAr:'تقرت', nameFr:'Touggourt', type:'wilaya', lat:33.1000, lng:6.0667,
    aliases:['تقرت','touggourt'],
    communes:[
      { name:'Touggourt', nameAr:'تقرت', lat:33.1000, lng:6.0667 },
      { name:'Megarine', nameAr:'مقارين', lat:33.2500, lng:6.1167 },
      { name:'Nezla', nameAr:'نزلة', lat:33.0333, lng:6.0333 },
    ]
  },
  // ── WILAYA 56 — DJANET ───────────────────────────────────────────────────
  { code:'56', name:'Djanet', nameAr:'جانت', nameFr:'Djanet', type:'wilaya', lat:24.5553, lng:9.4858,
    aliases:['جانت','djanet'],
    communes:[
      { name:'Djanet', nameAr:'جانت', lat:24.5553, lng:9.4858 },
    ]
  },
  // ── WILAYA 57 — EL M'GHAIR ───────────────────────────────────────────────
  { code:'57', name:'El M\'Ghair', nameAr:'المغير', nameFr:'El M\'Ghair', type:'wilaya', lat:33.9500, lng:5.9333,
    aliases:['المغير','el mghair','el m\'ghair'],
    communes:[
      { name:'El M\'Ghair', nameAr:'المغير', lat:33.9500, lng:5.9333 },
      { name:'Djamaa', nameAr:'جامعة', lat:33.5333, lng:5.9833 },
    ]
  },
  // ── WILAYA 58 — EL MENIAA ────────────────────────────────────────────────
  { code:'58', name:'El Meniaa', nameAr:'المنيعة', nameFr:'El Meniaa', type:'wilaya', lat:30.5833, lng:2.8833,
    aliases:['المنيعة','el meniaa','el menia'],
    communes:[
      { name:'El Meniaa', nameAr:'المنيعة', lat:30.5833, lng:2.8833 },
      { name:'Hassi Gara', nameAr:'حاسي القارة', lat:30.3833, lng:3.3500 },
    ]
  },
]

/**
 * Build a flat lookup index from the DB:
 * All wilaya names + all commune names mapped to their geo data
 */
export function buildGeoIndex() {
  const idx = []
  for (const w of ALGERIA_GEO_DB) {
    // Wilaya itself
    idx.push({
      name: w.name,
      nameAr: w.nameAr,
      nameFr: w.nameFr,
      type: 'ولاية',
      code: w.code,
      lat: w.lat,
      lng: w.lng,
      parent: null,
      aliases: w.aliases || [],
    })
    // Each commune
    for (const c of (w.communes || [])) {
      idx.push({
        name: c.name,
        nameAr: c.nameAr,
        nameFr: c.name,
        type: 'بلدية',
        code: w.code,
        lat: c.lat,
        lng: c.lng,
        parent: w.nameAr,
        parentFr: w.nameFr,
        aliases: c.aliases || [],
      })
    }
  }
  return idx
}

/**
 * Levenshtein distance for fuzzy matching
 */
export function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[m][n]
}

/**
 * Normalize text for matching: lowercase, remove diacritics, trim
 */
export function normText(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Arabic diacritics
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Smart location search with fuzzy matching
 * Returns: { found, entry, confidence, suggestions }
 */
export function searchGeoLocation(query) {
  const idx = buildGeoIndex()
  const q = normText(query)
  if (!q) return { found: false, suggestions: [] }

  const scored = []
  for (const entry of idx) {
    const candidates = [
      normText(entry.nameAr),
      normText(entry.nameFr || entry.name),
      normText(entry.name),
      ...(entry.aliases || []).map(normText),
    ]
    let bestScore = 0
    for (const cand of candidates) {
      // Exact match
      if (cand === q) { bestScore = 100; break }
      // Contains match
      if (cand.includes(q) || q.includes(cand)) { bestScore = Math.max(bestScore, 90); continue }
      // Fuzzy match using Levenshtein
      const maxLen = Math.max(q.length, cand.length)
      if (maxLen === 0) continue
      const dist = levenshtein(q, cand)
      const similarity = ((maxLen - dist) / maxLen) * 100
      bestScore = Math.max(bestScore, similarity)
    }
    if (bestScore > 40) scored.push({ entry, score: bestScore })
  }

  scored.sort((a, b) => b.score - a.score)

  if (!scored.length) return { found: false, suggestions: [] }

  const top = scored[0]
  const suggestions = scored.slice(0, 3).map(s => s.entry)

  if (top.score >= 90) {
    return { found: true, entry: top.entry, confidence: top.score, suggestions }
  }
  // Low confidence — return suggestions only
  return { found: false, confidence: top.score, suggestions }
}
