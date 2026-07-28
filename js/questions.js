/**
 * js/questions.js
 * ─────────────────────────────────────────────────────────────
 * نقش: Game Designer
 * بانک سوال ۱۰ دسته‌ای — بیش از ۸۰ سوال، حداقل ۸ سوال در هر دسته.
 *
 * جواب‌ها به‌صورت Base64 ذخیره شده‌اند تا با یک نگاه ساده در DevTools لو نروند.
 * این یک «سد کاغذی» است، نه امنیت واقعی — برای بازی دوستانه کافی است.
 * هر جواب یک آرایه است: [نام اصلی, نام مستعار ۱, نام مستعار ۲, ...]
 * ─────────────────────────────────────────────────────────────
 */

import { normalizeAnswer, levenshtein } from "./security.js";

export const CATEGORIES = Object.freeze([
  "Countries", "Marvel", "DC", "Movies", "Anime",
  "Football", "Animals", "Science", "History", "Games"
]);

/** نام فارسی دسته‌ها برای نمایش در UI. */
export const CATEGORY_LABELS = Object.freeze({
  Countries: "کشورها", Marvel: "مارول", DC: "دی‌سی", Movies: "فیلم",
  Anime: "انیمه", Football: "فوتبال", Animals: "حیوانات",
  Science: "علوم", History: "تاریخ", Games: "بازی‌ها"
});

const DIFFICULTIES = Object.freeze(["easy", "medium", "hard"]);

export const DIFFICULTY_LABELS = Object.freeze({
  easy: "آسان", medium: "متوسط", hard: "سخت", mixed: "ترکیبی"
});

/**
 * جدول جایگزینی: هر کاراکترِ متنِ اصلی به یک بایت ASCII نگاشت شده است.
 * دلیل: متن فارسی در UTF-8 دو بایت می‌گیرد و Base64 آن را ۱٫۳۳ برابر می‌کند؛
 * چون کل بانک جواب فقط از همین چند ده کاراکتر ساخته شده، این نگاشت
 * حجم دانلود را تقریباً نصف می‌کند و هم‌زمان جواب‌ها را از دید ساده مخفی نگه می‌دارد.
 * (یک «سد کاغذی» است نه امنیت واقعی — برای بازی دوستانه کافی است.)
 */
const CIPHER_PLAIN = "\u001e\u001f -12456abcdefghijklmnopqrstuvwxyzآئابتثجحخدذرزسشصضطظعغفقلمنهوپچژکگی۴۶‌";
const CIPHER_CODED = "!#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghij";

const DECODE_MAP = (() => {
  const map = new Map();
  for (let i = 0; i < CIPHER_CODED.length; i++) map.set(CIPHER_CODED[i], CIPHER_PLAIN[i]);
  return map;
})();

const GROUP_SEP = CIPHER_CODED[CIPHER_PLAIN.indexOf("\u001e")];
const ALIAS_SEP = CIPHER_CODED[CIPHER_PLAIN.indexOf("\u001f")];

/**
 * رمزگشایی بانک جواب یک سوال.
 * خروجی: آرایه‌ای از گروه‌ها؛ عضو اول هر گروه نام اصلی و بقیه نام‌های مستعارند.
 */
function decodeAnswers(encoded) {
  if (!encoded) return [];
  let out = "";
  for (const ch of encoded) out += DECODE_MAP.get(ch) || "";
  return out.split("\u001e").map((group) => group.split("\u001f"));
}

/**
 * فرمت فشرده‌ی رکورد سوال (برای کم کردن حجم دانلود):
 *   [ id, title, catIndex, diffIndex, maxAnswers, encodedAnswers ]
 * سوال آزاد ⇔ رشته‌ی جواب‌ها خالی باشد.
 */
const RAW_QUESTIONS = [
  ["ctr-001","کشورهای قاره‌ی آسیا",0,0,48,"GgPG_#3<+8#:/<=3+!dGb_#4+:+8!cg_#-238+!`_N#38.3+!eP`$K_aHg#eP`jK_aHg#=9?>2$59</+!eP`$S^G]g#eP`jS^G]g#89<>2$59</+!IPeg`#>?<5/C#>?<53C/!XPG[#3<+;!XPHRIG_#XPHRIG_$RXaNg#=+?.3$+<+,3+!G^GPGI#G^GPGI$^ILN`$XPHg#?+/![VP#;+>+<!eagI#5?A+3>!X^G_#97+8!HLPg_#,+2<+38!g^_#C/7/8!GPN_#49<.+8!RaPg`#=C<3+!]H_G_#6/,+898!GRPGFg]#3=<+/6!Z]RVg_#:+6/=>38/!GZYG_RIG_#+012+83=>+8!bGeRIG_#:+53=>+8!H_f]GNS#,+816+./=2!_bG]#8/:+6!HaIG_#,2?>+8!RPg]G_eG#=<3$6+85+!^G]Nga#7+6.3@/=!^gG_^GP#HP^`#7C+87+<!IGg]_N#>2+36+8.!]GFaR#6+9=!eG^HaK#-+7,9.3+!agI_G^#@3/>8+7!^G]Qg#7+6+C=3+!R_fGbaP#=381+:9</!G_Na_Qg#38.98/=3+!Zg]gbg_#:2363::38/=!HPa_Fg#,<?8/3!Ig^aP$SP[g#/+=>$>379<!^Ya]RIG_#7981963+![QG[RIG_#5+D+52=>+8!GQHeRIG_#?D,/53=>+8!IPe^_RIG_#>?<57/83=>+8!IGKgeRIG_#>+4353=>+8![P[gQRIG_#5C<1CD=>+8!EOPHGgKG_#+D/<,+34+8!GP^_RIG_#+<7/83+!fPKRIG_#1/9<13+![HPR#-C:<?="],
  ["ctr-002","کشورهای اروپایی",0,0,44,"ZPG_R`#0<+8-/!E]^G_#1/<7+8C!GgIG]gG#3>+6C!GRbG_gG#=:+38!bPIYG]#:9<>?1+6!G_f]RIG_#HPgIG_gG#/816+8.#?5!GgP]_N#3</6+8.!`]_N#8/>2/<6+8.=!H]dge#,/613?7!]aeQG^HaPf#6?B/7,9?<1!RaFgR#=A3>D/<6+8.!GIPgS#+?=><3+!]`RIG_#:96+8.!ce#K^`aPg$ce#-D/-2!GR]aGeg#=69@+53+!^KGPRIG_#2?81+<C!Pa^G_g#<97+83+!H]YGPRIG_#,?61+<3+!ga_G_#1<//-/!ePaGRg#-<9+>3+!GR]aa_g#=69@/83+!TPHRIG_#=/<,3+!HaR_g#,9=83+!^a_I`j_fPa#798>/8/1<9!^[Na_g`#7+-/.983+!E]HG_g#+6,+83+!eaQaa#59=9@9!RaFN#=A/./8!_Pad#89<A+C!NG_^GPe#./87+<5!Z_]G_N#0386+8.!GgR]_N#3-/6+8.!GRIa_g#/=>983+!]Ia_g#6+>@3+!]gIaG_g#63>2?+83+!H]GPaR#,/6+<?=!GaePGg_#?5<+38/!^a]NGag#796.9@+!PaRg`#<?==3+!^G]I#7+6>+!^a_Gea#798+-9!aGIgeG_#@+>3-+8!G_NaPG#+8.9<<+!R_$^GPg_a#=+8$7+<389"],
  ["ctr-003","کشورهای آفریقایی",0,1,30,"^TP#/1C:>!]gHg#63,C+!Ia_R#>?83=3+!G]KQGgP#+61/<3+!^PGeS#79<9--9!RaNG_#=?.+8!GIgabg#/>239:3+!Ra^G]g#=97+63+!e_gG#5/8C+!GafG_NG#?1+8.+!IG_QG_gG#>+8D+83+!PaG_NG#<A+8.+!_gKPg`#831/<3+!Y_G#12+8+!R_fG]#=/8/1+6!^G]g#7+63!_gKP#831/<!cGN#-2+.!eG^Pa_#-+7/<998!e_fa#-9819!E_fa]G#+8196+!QG^HgG#D+7,3+!Qg^HGHa`#D37,+,A/!^aQG^Hge#79D+7,3;?/!EZPg[Gg$K_aHg#=9?>2$+0<3-+!_G^gHgG#8+73,3+!HaIRaG_G#,9>=A+8+!^GNGfGReGP#7+.+1+=-+<!RGL]$XGK#3@9<C$-9+=>!HaPeg_GZGRa#,?<538+$0+=9"],
  ["ctr-004","پایتخت‌های کشورهای جهان",0,1,30,"I`PG_#>/2<+8!bGPgR#:+<3=!]_N_#698.98!HP]g_#,/<638!P^#<97/!^GNPgN#7+.<3.!]gRHa_#63=,98!EI_#+>2/8=!ag_#@3/88+!HPaeR]#,<?==/6=!E^RIPNG^#+7=>/<.+7!GR]a#9=69!GRIe`]^#=>9-52967!eb_`Gf#-9:/82+1/8!`]Rg_eg#2/6=3853!^Rea#79=-9A!egjgZ#5C3@#53/@!E_eGPG#+85+<+!HYNGN#,+12.+.!PgGU#<3C+.2!NaL`#.92+!GHaWHg#+,?$.2+,3![G`P`#-+3<9!Iaega#>95C9!be_#,/34381!RFa]#=/9?6!N`]g$_a#8/A$./623!GR]G^jEHGN#3=6+7+,+.!aGS_fI_#A+=2381>98!GIGaG#9>>+A+"],
  ["ctr-005","کشورهای آمریکای جنوبی",0,0,12,"HPQg]#,<+D36!EPdG_Ig_#+<1/8>38+!Sg]g#-236/!bPa#:/<?!e]^HgG#-9697,3+!a_QaF]G#@/8/D?/6+!GeaGNaP#/-?+.9<!Ha]gag#,963@3+!bGPGfaF`#:+<+1?+C!GPafaF`#?<?1?+C!fagG_#1?C+8+!RaPg_G^#=?<38+7/"],
  ["ctr-006","کشورهایی که پرچمشان رنگ قرمز دارد",0,2,0,""],
  ["ctr-007","استان‌های ایران",0,1,31,"I`PG_!G]HPQ![^!^PeQg![Qag_!fg]G_!^GQ_NPG_!f]RIG_!R^_G_!MPGRG_$PUag!MPGRG_$S^G]g!MPGRG_$K_aHg!RgRIG_$a$H]acRIG_!eP^G_!gQN!`P^QfG_!ZGPR!HaS`P!GTZ`G_!c`GP^LG]$a$HMIgGPg!e`fg]ag`$a$HagPGL^N!MaQRIG_!]PRIG_!Gg]G^!eP^G_SG`!ePNRIG_!`^NG_!Q_KG_!GPNHg]!EOPHGgKG_$SP[g!EOPHGgKG_$YPHg"],
  ["ctr-008","کشورهای جزیره‌ای",0,2,0,""],
  ["mrv-001","اعضای انتقام‌جویان (Avengers)",1,0,20,"EgPa_j^_#3<98$7+8#Ia_g$GRIGPe#>98C$=>+<5!eGbgIG_$E^PgeG#-+:>+38$+7/<3-+#GRIga$PGKPQ!JaP#>29<!`G]e#2?65#HPaR$H_P!H]e$agNa#,6+-5$A3.9A#_GIGSG!`GaeGg#2+A5/C/#e]g_I$HGPIa_!GRbGgNP^_#=:3./<7+8#=:3./<$7+8#^PN$X_eHaIg!NeIP$GRIP_K#.9->9<$=><+81/!H]e$b_IP#,6+-5$:+8>2/<#IcG]G!GReGP]I$agc#=-+<6/>$A3>-2#aG_NG!agd_#@3=398!ZG]ea_#0+6-98#R^$ag]Ra_!ag_IP$Ra]KP#A38>/<$=96.3/<#HGeg!G_Ij^_#+8>$7+8#^PN$^aPc`jGg!aRb#A+=:!eGbgIG_$^GPa]#-+:>+38$7+<@/6#eGPa]$N_aPQ!aGP$^Sg_#A+<$7+-238/#PaNg!GRIGP$]PN#=>+<$69<.#bgIP$eagg]!fPaI#1<99>!PGeI#<9-5/>"],
  ["mrv-002","شرورهای دنیای مارول",1,1,18,"IG_aR#>2+89=!]aeg#6953!G]IPG_#?6><98!PNReG]#</.$=5?66!eg]^G_fP#53667981/<!fPg_$fGH]g_#1<//8$19,638!NGe$Gae#.9->9<$9->9:?=#NeIP$GMIGbaR!a_a^#@/897!eGP_gK#-+<8+1/!^f_gIa#7+18/>9!I_aR!GHG^g_gS_#+,9738+>398!^_NPg_#7+8.+<38!`]G#2/6+!NaP^G^a#.9<7+77?!^gRIPga#7C=>/<39!e_f#5+81!fG]GeIaR#1+6+->?="],
  ["mrv-003","فیلم‌های دنیای سینمایی مارول",1,1,25,"EgPa_$^_#3<98$7+8!`G]e$SfZI$G_fgQ#38-</.3,6/$2?65!JaP#>29<!eGbgIG_$E^PgeG#-+:>+38$+7/<3-+!Ga_KPQ#+@/81/<=#G_I[G^$KagG_!XTP$G]IPG_#+1/$90$?6><98!K_f$NGM]g#-3@36$A+<!K_f$GHNgI#380383>C$A+<!bGgG_$HGQg#/8.1+7/!_f`HG_G_$e`eSG_#1?+<.3+8=$90$>2/$1+6+BC!NeIP$GRIP_K#.9->9<$=><+81/!H]e$b_IP#,6+-5$:+8>2/<!eGbgIG_$^GPa]#-+:>+38$7+<@/6!GRbGgNP^_$HGQfSI$H`$MG_`#297/-97381!GRbGgNP^_$NaP$GQ$MG_`#0+<$0<97$297/!GRbGgNP^_$PG`g$H`$MG_`$_gRI#89$A+C$297/!SG_f$cg#=2+81$-23!GgIP_G]Q#/>/<8+6=!G_I$^_#+8>$7+8!a_a^#@/897!NNba]#./+.:996!]afG_#691+8!JaP$Pf_GPae#<+18+<95!JaP$XS[$a$I_NP#69@/$+8.$>2?8./<!H]e$agNa#,6+-5$A3.9A"],
  ["mrv-004","قهرمانان تیم ایکس‌من",1,1,15,"a]aPg_#A96@/<38/!RGge]abR#-C-69:=!Kg_$fPg#4/+8$1</C!bPaZRaP$GgeR#:<90/==9<$B!GRIaP^#=>9<7!HgRI#,/+=>!_GgI$ePG]P#8312>-<+A6/<!Paf#<91?/!f^HgI#1+7,3>!ea]aRaR#-969==?=!EgR$^_#3-/7+8!KGfP_GI#4?11/<8+?>!^gRIge#7C=>3;?/!eagge$Rg]aP#;?3-5=36@/<!NgQ]"],
  ["mrv-005","سنگ‌های ابدیت (Infinity Stones)",1,0,6,"ZUG#=:+-/#EHg!O`_#738.#QPN!aG[XgI#</+63>C#[P^Q![NPI#:9A/<#H_ZS!Q^G_#>37/#RHQ!PaL#=9?6#_GP_Kg"],
  ["mrv-006","بازیگران اصلی فیلم‌های مارول",1,2,0,""],
  ["mrv-007","سریال‌های مارول",1,2,12,"aG_NG$agd_#A+8.+@3=398!ZG]ea_$a$RPHGQ$Q^RIG_#0+6-98$+8.$>2/$A38>/<$=96.3/<!]aeg#6953!`GaeGg#2+A5/C/!^a_$_GgI#7998$58312>!MG_^$^GPa]#7=$7+<@/6!Sg$`G]e#=2/$2?65!NgPNag]#.+</./@36!KRgeG$Ka_Q#4/==3-+$498/=!]ae$egK#6?5/$-+1/!bG_gSP#:?83=2/<!GgPa_$ZgRI#3<98$03=>"],
  ["mrv-008","قدرت‌های ابرقهرمانان مارول",1,1,0,""],
  ["dc-001","ابرقهرمانان دنیای DC",2,0,18,"RabP^_#=?:/<7+8#e]GPe$e_I!HI^_#,+>7+8#HPaR$ag_!aG_NP$aa^_#A98./<$A97+8#NGgG_G!Z]S#06+=2#HPg$E]_!EeaG^_#+;?+7+8!RGgHaPf#-C,9<1!fPg_$]_IP_#1<//8$6+8>/<8!fPg_$GPa#1<//8$+<<9A!SQ^#=2+D+7!_GgI$ag_f#8312>A381!PGHg_#<9,38!HI$fP]#,+>13<6!RabPfP]#=?:/<13<6!^GPS_$^_`G_IP#7+<>3+8$7+82?8>/<!H]e$e_Pg#,6+-5$-+8+<C!`Gae$^_#2+A57+8!QGIG_G#D+>+88+!e_RIG_Ig_#-98=>+8>38/"],
  ["dc-002","شرورهای DC",2,1,16,"KaeP#495/<!]eR$]aIP#6/B$6?>29<!`GP]g$eagg_#2+<6/C$;?388!Hg_#,+8/!b_faF_#:/81?38!PgN]P#<3..6/<!Ia%ZgR#>A9$0+-/#Na$c`P`!GRePePa#=-+</-<9A#^IPRe!bagQ_$Egag#:93=98$3@C!eI$aa^_#-+>A97+8!NGPe$RGgN#.+<5=/3.!NJ$GRIPae#./+>2=><95/!PFR$G]Ya]#<+=$+6$12?6!HP[$RgG`!Rg_RIPa#=38/=><9!PgaPR$Z]S#</@/<=/$06+=2"],
  ["dc-003","اعضای لیگ عدالت",2,0,8,"RabP^_#=?:/<7+8!HI^_#,+>7+8!aG_NP$aa^_#A98./<$A97+8!Z]S#06+=2!EeaG^_#+;?+7+8!RGgHaPf#-C,9<1!fPg_$]_IP_#1<//8$6+8>/<8!^GPS_$^_`G_IP#7+<>3+8$7+82?8>/<"],
  ["dc-004","فیلم‌های سینمایی DC",2,1,15,"^PN$ba]GNg_#7+8$90$=>//6!HI^_$NP$HPGHP$RabP^_#,+>7+8$@$=?:/<7+8!]gf$XNG]I#4?=>3-/$6/+1?/!aG_NP$aa^_#A98./<$A97+8!EeaG^_#+;?+7+8!SQ^#=2+D+7!KaM`$G_ILGPg#=?3-3./$=;?+.!KaeP#495/<!HI^_#>2/$,+>7+8!H]e$ENG^#,6+-5$+.+7!HP[#>2/$06+=2!SaG]g`$IGPgeg#.+<5$58312>!HI^_$EYGQ$^gje_N#,+>7+8$,/138=!MgQS$SaG]g`$IGPgeg#.+<5$58312>$<3=/=!HPN$RPN"],
  ["dc-005","شهرهای خیالی دنیای DC",2,2,8,"fGI`G^#19>2+7!^IPab]gR#7/><9:963=!R_IPG]$RgIg#-/8><+6$-3>C!GRIGP$RgIg#=>+<$-3>C!eaRI$RgIg#-9+=>$-3>C!GI]G_IgR#+>6+8>3=!I^gRgPG#>2/7C=-3<+!H]GN`ga_#,6?.2+@/8"],
  ["dc-006","بازیگرانی که نقش بتمن را بازی کرده‌اند",2,2,7,"ePgRIg_$Hg]#-2<3=>3+8$,+6/!H_$GZ]e#,/8$+006/-5!PGHPI$bIg_Ra_#<9,/<>$:+>>38=98!^Gge]$egIa_#73-2+/6$5/+>98!aG]$eg]^P#@+6$5367/<!KPK$e]a_g#1/9<1/$-6998/C!ENG^$aRI#+.+7$A/=>"],
  ["dc-007","سریال‌های تلویزیونی DC",2,1,10,"GPa#+<<9A!Z]S#>2/$06+=2!RabPfP]#=?:/<13<6!]K_NQ#6/1/8.=$90$>979<<9A!fGI`G^#19>2+7!IGgIG_j`G#>3>+8=!Na^$bGIPa]#.997$:+><96!bgR$^geP#:/+-/7+5/<!RabP^_$a$]aFgR#=?:/<7+8$+8.$693=!_aKaG_G_$IGgIG_#>//8$>3>+8="],
  ["dc-008","قدرت‌ها و توانایی‌های شخصیت‌های DC",2,1,0,""],
  ["mov-001","فیلم‌های برنده‌ی اسکار بهترین فیلم",3,2,15,"bNPMaG_N`#>2/$19.0+>2/<!IGgIG_ge#>3>+83-!f]GNgGIaP#16+.3+>9<!GPHGH$L][`j`G#69<.$90$>2/$<381=!G_f]#:+<+=3>/!HGQfSI$H`$Eg_N`!SgeGfa#-23-+19!HPN^_#,3<.7+8!GRbGI]GgI#=:9>6312>!^`IGH#79986312>!eIGH$RHQ#1<//8$,995!_a^N]_N#897+.6+8.!eaNG#-9.+!`^`$cgQ$`^`$KG#/@/<C>2381$/@/<CA2/</!Gab_`Gg^P#9::/82/37/<"],
  ["mov-002","فیلم‌های کریستوفر نولان",3,1,11,"I][g_#38-/:>398!^gG_jRIGP`jGg#38>/<=>/66+<!NG_ePe#.?853<5!I_I#>/8/>!Gab_`Gg^P#9::/82/37/<!bPRIgd#>2/$:</=>31/!^^_Ia#7/7/8>9!HgjMaGHg#38=9783+!HI^_$EYGQ$^gje_N#,+>7+8$,/138=!SaG]g`$IGPgeg#>2/$.+<5$58312>!MgQS$SaG]g`$IGPgeg#>2/$.+<5$58312>$<3=/="],
  ["mov-003","فیلم‌های انیمیشن پیکسار",3,0,15,"NGRIG_$GRHGHjHGQg#>9C$=>9<C!NP$KRIKag$_^a#038.381$8/79!SfZIjG_fgQG_#>2/$38-</.3,6/=!HG]G#?:!aG]jGg#A+66$/!PGIGIagg#<+>+>9?366/!^GSg_j`G#-+<=!`ga]G`Gg$SPeIg#798=>/<=$38-!SKGX#,<+@/!NPa_$HgPa_#38=3./$9?>!eaea#-9-9!PaL#=9?6!]aeG#6?-+!Q_Nfg$ge$LSP`#+$,?1=$630/!N_gGg$GRPGPE^gQ#98A+<."],
  ["mov-004","فیلم‌های ایرانی معروف",3,1,12,"KNGgg$_GNP$GQ$Rg^g_#KNGgg!Hc`j`Gg$ER^G_!VX^$fg]GR!NPHGP`$G]g!ZPaS_N`!^GP^a]e!GMPGKgj`G!R_IaPg!`G^a_!fGa![gTP!GHN$a$ge$PaQ"],
  ["mov-005","بازیگران مرد مشهور هالیوود",3,0,18,"]Fa_GPNa$NgjeGbPga#6/98+<.9$.3-+:<39!HPN$bgI#,<+.$:3>>!IG^$ePaQ#>97$-<?3=/!IG^$`_eR#>97$2+85=!PGHPI$NGa_g$Ka_gaP#<9,/<>$.9A8/C!KG_g$Nb#49288C$./::!^aPfG_$ZPg^_#79<1+8$0<//7+8!N_Q]$aGS_fI_#./8D/6$A+=2381>98!G]$bGcg_a#+6$:+-389!PGHPI$N_gPa#<9,/<>$./$83<9!ePgRIg_$Hg]#-2<3=>3+8$,+6/!^I$Ng^a_#7+>>$.+798!egG_a$PgaQ#5/+8?$<//@/=!ag]$GR^gI#A366$=73>2!`ga$Ke^_#2?12$4+-57+8!PGe#.A+C8/$4928=98!Kge$Kg]_`G]#4+5/$1C66/82++6!MaGeg_$Zg_geR#49+;?38$:29/83B"],
  ["mov-006","فیلم‌های ژانر ترسناک",3,1,0,""],
  ["mov-007","کارگردانان مشهور سینما",3,2,14,"GRIga_$GRbg]HPf#=:3/6,/<1!^GPIg_$GReaPRgQg#=-9<=/=/!eaF_Ig_$IGPG_Ig_a#>+<+8>389!ePgRIaZP$_a]G_#896+8!Kg^Q$eG^Pa_#-+7/<98!PgN]g$GReGI#<3.6/C$=-9>>!NgagN$Zg_cP#038-2/<!GRI_]g$eaHPge#5?,<3-5!E]ZPN$`gceGe#23>-2-9-5!ZPG_RgR$ZaPN$eGba]G#-9::96+!GTYP$ZP`GNg#0+<2+.3!XHGR$egGPRI^g#53+<9=>+73!Ha_f$Ka_$`a#,981$4998$29!aR$G_NPRa_#A/=$+8./<=98"],
  ["mov-008","فیلم‌های پرفروش تاریخ سینما",3,2,0,""],
  ["anm-001","انیمه‌های شونن معروف",4,0,15,"_GPaIa#8+<?>9!aG_$bgR#98/$:3/-/!H]gc#,6/+-2!NPGfa_$HG]#.<+198$,+66!L^]`$H`$IGgIG_#+>>+-5$98$>3>+8!S^SgPQ_$SgVG_#./798$=6+C/<#eg^IRa!KaKaIRa$eGgR_#4?4?>=?$5+3=/8!`G_IP$`G_IP#2?8>/<$B$2?8>/<!^Gg$`gPa$EeGN^gG#7C$2/<9$+-+./73+!ZgPg$Ig]#0+3<C$>+36!eg^gGfP$I^G^$Z]Qg#0?667/>+6$+6-2/73=>!Iaega$Ya]#>95C9$129?6!H]e$e]GaP#,6+-5$-69@/<!Ra_$NgN]g$Rg_Q#=/@/8$./+.6C$=38=!ga$ga$`GeaSa#C?$C?$2+5?=29"],
  ["anm-002","شخصیت‌های ناروتو",4,1,16,"_GPaIa#8+<?>9!RGRe`#=+=?5/!RGeaPG#=+5?<+!eGeGSg#5+5+=23!GgIGcg#3>+-23!fGPG#1++<+!`g_GIG#238+>+!SgeG^GPa#=235+7+<?!Pae$]g#<9-5$6//!_Kg#8/43!KgPGgG#43<+3C+!IRa_GNg#>=?8+./!GaPacg^GPa#9<9-237+<?!bg_#:+38!^GNGPG#7+.+<+!GaHgIa#9,3>9"],
  ["anm-003","انیمه‌های استودیو جیبلی",4,2,12,"`^RGg`$^_$IaIaPa#>9>9<9!S`P$GSHGL#=:3<3>/.$+A+C![]X`$^ILPe$`Ga]#29A6=$79@381$-+=>6/!bP_RR$^a_a_ae`#:<38-/==$7989895/!ba_ga#:98C9!RPagR$ILag]$egeg#5353=$./63@/<C$=/<@3-/![]X`$ER^G_g$]GbaIG#-+=>6/$38$>2/$=5C!^NZ_$eP^j`Gg$SHjIGH#1<+@/$90$>2/$03</063/=!HGN$HP^gjMgQN#>2/$A38.$<3=/=!EPgIg#+<<3/>>C!_GFaRgeG#8+?=3-++!baPea$PaRa#:9<-9$<9==9"],
  ["anm-004","شخصیت‌های وان پیس",4,2,12,"]aZg#6?00C!QaPa#D9<9!_G^g#8+73!GaRab#?=9::!RG_Kg#=+843!cabP#-29::/<!_gea$PGHg_#<9,38!ZPG_eg#0<+85C!HPae#,<995!Kg_Hg#438,/!SG_eR#=2+85=!GgR#+-/"],
  ["anm-005","انیمه‌های ژانر ایسکای",4,1,0,""],
  ["anm-006","شخصیت‌های دراگون بال",4,1,12,"faea#195?!aKgIG#@/1/>+!fa`G_#192+8!bgea]a#:3--969!ePg]g_#5<36638!ZPgQG#0<3/D+!R]#-/66!Ha#7+438$,??!IPGeR#><?85=!Ha]^G#,?67+!HgPaR#,//<?=!agR#A23="],
  ["anm-007","انیمه‌های ورزشی",4,2,8,"`Ggega#2+35C??!eaPaea$HReIHG]#5?<959$89$,+=5/>!H]a$]Ge#,6?/$69-5!eGbgIG_$RaHGRG#-+:>+38$>=?,+=+!bP_R$I_gR#:<38-/$90$>/883=!bg_f$ba_f#:381$:981!gaPg$Pag$gM#C?<3$98$3-/!GR]^$NG_e#=6+7$.?85"],
  ["anm-008","انیمه‌های محبوب سال‌های اخیر",4,1,0,""],
  ["ftb-001","تیم‌های لیگ برتر انگلیس",5,1,20,"^_cRIP$ga_GgIN#7+8-2/=>/<$?83>/.!^_cRIP$RgIg#7+8-2/=>/<$-3>C!]gaPba]#63@/<:996!c]Rg#-2/6=/+!EPR_G]#+<=/8+6!IGI_`G^#>9>>/82+7!GaPIa_#/@/<>98!_gaeGR]#8/A-+=>6/!GRIa_$ag]G#+=>98$@366+!aRI`^#A/=>$2+7!]RIPRgIg#6/3-/=>/<!HPGgIa_#,<312>98!ePgRIG]$bG]GR#-<C=>+6$:+6+-/!Za]G^#0?62+7!HP_IZaPN#,</8>09<.!a]aP`^bIa_#A96@/=!_aIg_f`G^$ZGPRI#89>>3812+7$09</=>!HaP_^aJ#,9?<8/79?>2!RGaI`^bIa_#=9?>2+7:>98!]gNQ#6//.="],
  ["ftb-002","برندگان توپ طلا",5,2,15,"]ga_]$^Rg#7/==3!ePgRIgG_a$Pa_G]Na#<98+6.9!ePg^$H_Q^G#,/8D/7+!]aeG$^aNPgc#79.<3-!Pa_G]Ng_ga#<98+6.3829!eGeG#5+5+!Qg_jG]Ng_$QgNG_#D3.+8/!Pa_G]Na$_GQGPga#<98+6.9$8+D+<39!]aggR$Zgfa#0319!^gS]$b]GIg_g#:6+>383!ga`G_$ePGgaZ#-<?C00!ZPG_IR$He_jHGaFP#,/-5/8,+?/<!KaPK$aG#1/9<1/$A/+2!bGa]$_NNaN#8/.@/.!PaNPgfa"],
  ["ftb-003","تیم‌های ملی قهرمان جام جهانی",5,1,8,"HPQg]#,<+D36!E]^G_#1/<7+8C!GgIG]gG#3>+6C!EPdG_Ig_#+<1/8>38+!ZPG_R`#0<+8-/!GPafaF`#?<?1?+C!G_f]gR#/816+8.!GRbG_gG#=:+38"],
  ["ftb-004","بازیکنان مشهور ایرانی",5,1,14,"X]g$NGgg!X]g$ePg^g!^`Ng$^`NagjegG!KaGN$_ea_G^!RPNGP$EQ^a_!^`Ng$VGP^g!X]gPUG$HgPG_a_N!GSeG_$NdGf`!ePg^$HG[Pg!MNGNGN$XQgQg!aLgN$`GS^gG_!^RXaN$SKGXg!X]gPUG$K`G_HMS!GL^NPUG$XGHNQGN`"],
  ["ftb-005","باشگاه‌های لالیگا اسپانیا",5,1,16,"PFG]$^GNPgN#</+6$7+.<3.!HGPR]a_G#,+<-/698+!GI]Igea$^GNPgN#+>6/>3-9!RagG#=/@366+!aG]_RgG#@+6/8-3+!agGPFG]#@366+<</+6!GI]Ige$Hg]HGFa#+>26/>3-$,36,+9!PFG]$RaRgNGN#</+6$=9-3/.+.!HIgR#,/>3=!R]IGagfa#-/6>+$@319!MgPa_G#13<98+!GaRGRa_G#9=+=?8+!PGga$aGgeG_a#<+C9!^GgaPeG#7+669<-+!fPG_GNG#1<+8+.+!GRbG_ga]#/=:+8C96"],
  ["ftb-006","مربیان مشهور فوتبال",5,2,12,"bb$faGPNga]G#1?+<.396+!gaPf_$e]ab#569::!daQ`$^aPg_ga#79?<3829!eGP]a$E_c]aIg#+8-/69>>3!Qg_jG]Ng_$QgNG_#D3.+8/!E_Ia_ga$ea_I`#-98>/!Ng`jfa$Rg^Fa_`#=37/98/!Ia^GR$IaM]#>?-2/6!EPR_$a_fP#A/81/<!G]eR$ZPfaR_#0/<1?=98!]aggR$G_Pge`#/8<3;?/!GReG]a_g#=-+6983"],
  ["ftb-007","ورزشگاه‌های معروف جهان",5,2,0,""],
  ["ftb-008","تیم‌های لیگ برتر ایران",5,0,16,"bPRba]gR!GRI[]G]!RbG`G_!IPGeIaP!Za]GN!f]jf`P!^R$PZR_KG_!OaHjE`_!_RGKg!bgeG_!E]a^g_ga^$GPGe!^]aG_!T_XI$_ZI$EHGNG_!bGPR$K_aHg!S^R$EOP!`aGNGP"],
  ["anl-001","حیوانات وحشی جنگل",6,0,20,"SgP#6398!HHP#>31/<!b]_f#6/9:+<.!gaQb]_f#-2//>+2!fPf#A960!MPR#,/+<!PaHG`#09B!eZIGP#2C/8+!Zg]#/6/:2+8>!ePfN_#<2389!GRH$EHg#23::9!QPGZ`#13<+00/!faQ_#.//<!fPGQ#,9+<!SYG]#4+-5+6!^g^a_#7985/C!faPg]#19<366+!SG^bG_Q`#-237:+8D//!GaPG_faIG_#9<+81?>+8!R_KGH#=;?3<</6"],
  ["anl-002","پرندگان",6,0,18,"X[GH#/+16/!SG`g_#0+6-98!eHaIP#:31/98!f_KSe#=:+<<9A!VaVg#:+<<9>!e]GY#-<9A!H]H]#8312>381+6/![_GPg#-+8+<C!^PY#-23-5/8!MPaR#<99=>/<!GPNe#.?-5!YGQ#199=/!Ha[]^a_#>?<5/C!VGaaR#:/+-9-5!SIP^PY#9=><3-2!b_faF_#:/81?38!KYN#9A6!]ej]e#=>9<5"],
  ["anl-003","آبزیان و موجودات دریایی",6,1,16,"eaR`#=2+<5!_`_f#A2+6/!N]Zg_#.96:238!GMIGbaR#9->9:?=!^G`g$^PeH#=;?3.!XPaR$NPgGgg#4/66C03=2!MPc_f#-<+,!^gfa#=2<37:!]GejbSI$NPgGgg#=/+$>?<>6/!RIGP`$NPgGgg#=>+<03=2!GRH$NPgGgg#=/+29<=/!^GP^G`g#//6!TNZ#-6+7!SgP$NPgGgg#=/+$6398!Ze#=/+6!R^aP$EHg#9>>/<"],
  ["anl-004","حیوانات اهلی و خانگی",6,0,12,"Rf#.91!fPH`#-+>!GRH#29<=/!fGa#-9A!faRZ_N#=2//:!HQ#19+>!G]GY#.985/C!SIP#-+7/6!MPfaS#<+,,3>!`^RIP#2+7=>/<!^G`g$[P^Q#196.03=2!eHaIP$MG_fg#:31/98"],
  ["anl-005","حشرات",6,1,14,"^aPc`#+8>!Q_HaP#,//!^fR#06C!bS`#79=;?3>9!bPaG_`#,?>>/<06C!RaRe#,//>6/!^]M#1<+==29::/<!R_KG[e#.<+19806C!X_eHaI#=:3./<!X[PH#=-9<:398!eP^$GHPgS^#=365A9<7!SbS#69?=/!ee#06/+!^aPgG_`#>/<73>/"],
  ["anl-006","حیوانات در خطر انقراض",6,2,0,""],
  ["anl-007","خزندگان",6,1,10,"^GP#=8+5/!^GP^a]e#63D+<.!]GejbSI#>?<>6/!I^RGL#-<9-9.36/!ePaeaNg]#+6631+>9<!EZIGHjbPRI#-2+7/6/98!GgfaG_G#31?+8+!eHPg#-9,<+!GZXg#@3:/<!bgIa_#:C>298"],
  ["anl-008","حیواناتی که در قطب زندگی می‌کنند",6,2,0,""],
  ["sci-001","عناصر جدول تناوبی",7,1,25,"`gNPad_#2C.<91/8!`]ga^#2/63?7!]gIga^#63>23?7!ePH_#-+<,98!_gIPad_#83><91/8!GeRgd_#9BC1/8!Z]aFaP#06?9<38/!_Fa_#8/98!RNg^#=9.3?7!^_gQg^#7+18/=3?7!E]a^g_ga^#+6?7383?7!Rg]gRg^#=363-98!ZRZP#:29=:29<?=!fafPN#=?60?<!e]P#-269<38/!bIGRg^#:9>+==3?7!e]Rg^#-+6-3?7!E`_#3<98!^R#-9::/<!Pag#D38-!_[P`#=36@/<!V]G#196.!Kga`#7/<-?<C!RPH#6/+.!GaPG_ga^#?<+83?7"],
  ["sci-002","سیارات و اجرام منظومه شمسی",7,0,12,"XVGPN#7/<-?<C!Q`P`#@/8?=!Q^g_#/+<>2!^PgM#7+<=!^SIPg#4?:3>/<!QL]#=+>?<8!GaPG_aR#?<+8?=!_bIa_#8/:>?8/!b]aIa#:6?>9!^G`#7998!MaPSgN#=?8!RPR#-/</="],
  ["sci-003","دانشمندان مشهور تاریخ",7,1,16,"Gg_SIg_#/38=>/38!_gaI_#8/A>98!fG]g]`#1+636/9!IR]G#>/=6+!GNgRa_#/.3=98!^GPg$eaPg#7+<3/$-?<3/!NGPag_#.+<A38!GRIga_$`Gaeg_f#2+A5381!ebP_ge#-9:/<83-?=!bGRIaP#:+=>/?<!^_N]#7/8./6!Ha`P#,92<!`GgQ_HPf#2/3=/8,/<1!GH_$Rg_G#+@3-/88+!MaGPQ^g!PGQg"],
  ["sci-004","اندام‌های بدن انسان",7,0,16,"[]H#2/+<>!^YQ#,<+38!eHN#63@/<!e]g`#53.8/C!SS#Pg`#6?81!^XN`#=>97+-2!PaN`#38>/=>38/!bG_ePGR#]aQG]^XN`#:+8-</+=!VLG]#=:6//8!^JG_`#,6+../<!baRI#=538!cS^#/C/!faS#/+<!QHG_#>981?/!GRIMaG_#,98/!XU]`#7?=-6/"],
  ["sci-005","واحدهای اندازه‌گیری فیزیک",7,2,14,"^IP#7/>/<!eg]afP^#53691<+7!JG_g`#=/-98.!E^bP#+7:/</!e]ag_#5/6@38!^a]#796/!e_N]G#-+8./6+!_gaI_#8/A>98!da]#49?6/!aGI#A+>>!bGReG]#:+=-+6!a]I#@96>!G`^#927!`PIQ#2/<>D"],
  ["sci-006","اختراعات تاثیرگذار بشر",7,1,0,""],
  ["sci-007","انواع انرژی‌های تجدیدپذیر",7,0,7,"MaPSgNg#=96+<!HGNg#A38.!EHg#2C.<9!Q^g_jfP^Ggg#1/9>2/<7+6!QgRIjIaN`#,397+==!KQP$a$^N#>3.+6!^aK#A+@/"],
  ["sci-008","بیماری‌های شناخته‌شده",7,2,0,""],
  ["his-001","امپراتوری‌های تاریخی",8,1,14,"`MG^_Sg#+-2+/7/83.!RGRG_g#=+==+83.!GSeG_g#:+<>23+8!Pa^#<97+8!XJ^G_g#9>>97+8!^Ya]#798196!HPgIG_gG#,<3>3=2$/7:3</!HgQG_R#,CD+8>38/!^TP$HGRIG_#+8-3/8>$/1C:>!cg_#-238/=/$/7:3</!Gg_eG#38-+!EQIe#+D>/-!^GN#7/.3+8!TZag#=+0+@3."],
  ["his-002","پادشاهان و حاکمان ایران",8,2,14,"eaPaS#-C<?=!NGPgaS#.+<3?=!MSGgGPSG#B/<B/=!GPNSgP#+<.+=23<!SGbaP#=2+:?<!G_aSgPaG_#+8?=23<@+8!SG`$XHGR#+,,+=!_GNPSG`#8+./<!ePg^$MG_#5+<37$52+8!E[G^L^NMG_!ZILX]g$SG`!_GTPG]Ng_$SG`!PUG$SG`!^L^NPUG$SG`"],
  ["his-003","جنگ‌های مهم تاریخ",8,1,12,"K_f$K`G_g$Ga]#A9<6.$A+<$&!K_f$K`G_g$Na^#A9<6.$A+<$'!K_f$RPN#-96.$A+<!K_f$agI_G^#@3/>8+7$A+<!K_f$eP`#59</+8$A+<!K_f$GgPG_$a$XPG[#3<+8$3<+;$A+<!K_fj`Gg$T]gHg#-<?=+./=!K_f$NGM]g$E^PgeG#+7/<3-+8$-3@36$A+<!K_f$TN$RG]`#2?8.</.$C/+<=$A+<!K_f$M]gK$ZGPR#1?60$A+<!K_f$_Gb]Fa_g#8+:96/983-$A+<=!K_f$cG]NPG_"],
  ["his-004","تمدن‌های باستانی",8,1,10,"Hg_jG]_`Pg_#7/=9:9>+73+!^TP$HGRIG_#+8-3/8>$/1C:>!ga_G_$HGRIG_#+8-3/8>$1<//-/!Pa^$HGRIG_#+8-3/8>$<97/!Gg]G^#/6+7!Ra^P#=?7/<!HGH]#,+,C698!ESaP#+==C<3+!`GPGbG#38.?=!^GgG#7+C+"],
  ["his-005","رهبران سیاسی قرن بیستم",8,2,12,"cPcg]#-2?<-2366!PaQa]I#<99=/@/6>!GRIG]g_#=>+638!`gI]P#23>6/<!fG_Ng#1+8.23!^G_N]G#7+8./6+!e_Ng#5/88/.C!Naf]#./$1+?66/!^GFa#7+9!]_g_#6/838!^TN[!EIGIaPe#+>+>?<5"],
  ["his-006","اکتشافات جغرافیایی و کاشفان",8,2,0,""],
  ["his-007","عجایب هفتگانه جهان",8,0,7,"NgaGP$cg_#1</+>$A+66!bIPG#:/><+!ea]aRFa^#-969==/?7!cgc_$GgIQG#-23-2/8$3>D+!^Gcabgca#7+-2?$:3--2?!IGK$^L]#>+4$7+2+6!^KR^`$^RgL$Pga#-2<3=>$</.//7/<"],
  ["his-008","اختراعات و رویدادهای تاریخی مهم",8,1,0,""],
  ["gam-001","بازی‌های ویدیویی معروف",9,0,20,"^Gg_ePGZI#738/-<+0>!ZaPI_GgI#09<>83>/!eG]$EZ$NgaIg#-+66$90$.?>C!KgjIgjGg#1>+!ZgZG#030+!bR#:/=!eG_IP$GRIPGge#-9?8>/<$=><35/!aG]aPG_I#@+69<+8>!]gf$EZ$]K_NQ#6/+1?/$90$6/1/8.=!NaIG#.9>+!GaPaGc#9@/<A+>-2!GbeR#+:/B!bGHKg#:?,1!agcP#A3>-2/<!RGgHPbG_e#-C,/<:?85!PN$NN$PgN^bS_#</.$./+.!G]N_$Pg_f#/6./8$<381!NGPe$Ra]Q#.+<5$=9?6=!fGN$EZ$aGP#19.$90$A+<!GRGRg_Q$ePgN#+==+==38=$-<//."],
  ["gam-002","کنسول‌های بازی",9,1,14,"b]g$GRIgS_#:6+C=>+>398#:=)!GgeR$HGeR#B,9B!_g_I_Na$Raggc#=A3>-2!ag#A33!fg^$Hag#1+7/,9C!_g_I_Na$ih#8*(!RfG#=/1+!EIGPg#+>+<3!bgjGRjbg#:=:!_g_I_Na$NgjGR#838>/8.9$.=!fg^$egaH#1+7/-?,/!GRIg^$Ne#=>/+7$./-5!NPg^$eRI#.</+7-+=>!_gR#8/="],
  ["gam-003","بازی‌های رومیزی و فکری",9,0,12,"SVP_K#-2/==!^_c!^GP$a$b]`!^a_aba]g#7989:96C!GaG_a#?89!bG_Ia^g^!^GZgG#7+03+!K_fG#4/81+!IMI`$_PN#,+-51+7798!Na^g_a#.97389!bGQ]#:?DD6/!RaNaea#=?.95?"],
  ["gam-004","بازی‌های بتل رویال",9,1,8,"ZaPI_GgI#09<>83>/!bGHKg#:?,1!GbeR$]K_NQ#+:/B$6/1/8.=!aGPQa_#A+<D98/!ZG]$fGgQ#0+66$1?C=!_ga$GRIgI#8/A$=>+>/!ZPg$ZGgP#0<//$03</!H]GN`G_I#,699.2?8>"],
  ["gam-005","شخصیت‌های معروف بازی‌های ویدیویی",9,1,14,"^GPga#7+<39!]aggKg#6?313!Ra_ge#=983-!]g_e#6385!bgeGca#:35+-2?!ePgIaR#5<+>9=!]GPG$ePGZI#6+<+$-<90>!^RIP$cgZ#7+=>/<$-23/0!fgPG]I#1/<+6>!GIQga#/D39!RG]gN$GR_ge#=8+5/!be$^_#:+-7+8!GRIga#=>/@/!EPIaP$^aPfG_#+<>2?<$79<1+8"],
  ["gam-006","بازی‌های موبایل پرطرفدار",9,0,0,""],
  ["gam-007","استودیوهای بازی‌سازی",9,2,12,"PGeRIGP#<9-5=>+<!gaHgjRGZI#?,3=90>!GgjGg#/+!GeIgagd_#+->3@3=398!H]gQGPN#,63DD+<.!_GIg$NGf#8+?12>C$.91!ZPG^$RGZIaP#0<97=90>A+</!RgjNg$bPGKeI#-.$:<94/5>!a]a#@+6@/!_g_I_Na#838>/8.9!ebeG^#-+:-97!GReaFP$G_geR#=;?+</$/83B"],
  ["gam-008","ژانرهای بازی‌های ویدیویی",9,1,12,"GeS_#+->398!^GKPGKagg#+.@/8>?</!_[S$EZPg_g#<:1!GRIPGIdg#=><+>/1C!SaIP#=299>/<!aPQSg#=:9<>=!^RGH[`jGg#<+-381!bGQ]#:?DD6/!IPR_Ge#29<<9<!SHg`jRGQ#=37?6+>398!H[G#=?<@3@+6!b]IZP^P#:6+>09<7/<"]
];

/**
 * لیست عمومی سوال‌ها. `answers` به‌صورت lazy رمزگشایی می‌شود
 * تا هزینه‌ی پردازش اولیه‌ی صفحه صفر بماند.
 */
export const QUESTIONS = RAW_QUESTIONS.map(([id, title, catIdx, diffIdx, maxAnswers, enc]) => {
  let cache = null;
  return {
    id,
    title,
    category: CATEGORIES[catIdx],
    difficulty: DIFFICULTIES[diffIdx],
    maxAnswers,
    isOpen: !enc,
    get answers() {
      if (cache === null) cache = decodeAnswers(enc);
      return cache;
    }
  };
});

export const QUESTION_COUNT = QUESTIONS.length;

export function getQuestionById(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

/** سقف نرم پیشنهاد برای سوال‌های آزاد. */
export const OPEN_SOFT_CAP = 30;

/** حداکثر عدد مجاز برای Bid روی یک موضوع. */
export function maxBidFor(topic) {
  if (!topic) return OPEN_SOFT_CAP;
  if (topic.isOpen) return OPEN_SOFT_CAP;
  return Math.max(1, Number(topic.maxAnswers) || OPEN_SOFT_CAP);
}

/**
 * انتخاب سوال تصادفی.
 * @param {string[]} categories دسته‌های مجاز (خالی = همه)
 * @param {string} difficulty  easy|medium|hard|mixed
 * @param {string[]} excludeIds سوال‌هایی که در همین بازی تکرار نشوند
 */
export function getRandomQuestion(categories = [], difficulty = "mixed", excludeIds = []) {
  const cats = Array.isArray(categories) && categories.length ? categories : CATEGORIES;
  const excluded = new Set(excludeIds || []);

  let pool = QUESTIONS.filter((q) =>
    cats.includes(q.category) &&
    (difficulty === "mixed" || q.difficulty === difficulty) &&
    !excluded.has(q.id));

  // اگر با فیلترها چیزی نماند، محدودیت‌ها را پله‌پله شل می‌کنیم
  if (!pool.length) pool = QUESTIONS.filter((q) => cats.includes(q.category) && !excluded.has(q.id));
  if (!pool.length) pool = QUESTIONS.filter((q) => !excluded.has(q.id));
  if (!pool.length) pool = QUESTIONS;

  const idx = Math.floor(Math.random() * pool.length);
  return toTopic(pool[idx]);
}

/** تبدیل سوال به شکل ذخیره‌شونده در سند اتاق (بدون جواب‌ها). */
export function toTopic(question) {
  if (!question) return null;
  return {
    id: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    maxAnswers: question.isOpen ? 0 : question.maxAnswers,
    isOpen: !!question.isOpen
  };
}

/** ساخت موضوع دستی توسط Host (همیشه آزاد و با تایید دستی). */
export function makeCustomTopic(title) {
  return {
    id: `custom-${Date.now().toString(36)}`,
    title,
    category: "Custom",
    difficulty: "mixed",
    maxAnswers: 0,
    isOpen: true
  };
}

/** سوال‌های یک دسته (برای لیست انتخاب Host). */
export function questionsByCategory(category) {
  return QUESTIONS.filter((q) => q.category === category);
}

/**
 * اعتبارسنجی یک جواب در برابر بانک جواب سوال بسته.
 * خروجی: { valid, canonical, reason }
 * reason: 'ok' | 'duplicate' | 'off-topic' | 'empty'
 */
export function checkAnswer(topicId, rawText, previousCanonicals = []) {
  const text = normalizeAnswer(rawText);
  if (!text) return { valid: false, canonical: "", reason: "empty" };

  const question = getQuestionById(topicId);
  if (!question || question.isOpen) {
    // سوال آزاد: تصمیم با Host است، فقط تکراری بودن بررسی می‌شود
    if (previousCanonicals.includes(text)) return { valid: false, canonical: text, reason: "duplicate" };
    return { valid: false, canonical: text, reason: "pending" };
  }

  const list = question.answers;
  for (const variants of list) {
    for (const variant of variants) {
      const norm = normalizeAnswer(variant);
      if (!norm) continue;
      const exact = norm === text;
      // تحمل یک غلط املایی فقط برای کلمات ۵ حرف به بالا
      const fuzzy = !exact && norm.length >= 5 && text.length >= 5 &&
                    levenshtein(norm, text, 1) <= 1;
      if (exact || fuzzy) {
        const canonical = normalizeAnswer(variants[0]);
        if (previousCanonicals.includes(canonical)) {
          return { valid: false, canonical, reason: "duplicate" };
        }
        return { valid: true, canonical, reason: "ok" };
      }
    }
  }
  return { valid: false, canonical: text, reason: "off-topic" };
}
