# QRAGY Bot Cikti Filtreleme Kurallari
<!-- Bu dosya ornek icin olusturulmustur. Kendi projenize gore icerigini ozellestirin. -->

## Format Kontrolu
Yanitta markdown baslik (#), liste isareti (-, *), kod blogu, emoji veya HTML etiketi varsa temizle.
Yanit duz metin olmali, paragraflar arasinda tek satir bosluk olabilir.

## Uzunluk Kontrolu
Bilgilendirme yanitlari en fazla 6 cumle olabilir.
Bilgi toplama ve yonlendirme yanitlari en fazla 4 cumle olabilir.
Selamlama ve farewell yanitlari en fazla 2 cumle olabilir.
Toplam karakter limiti 800 karakterdir.

## Prompt Leak Kontrolu
Yanitta "system prompt", "talimat", "instruction", "persona", "bootstrap", "response policy" gibi ic yapi terimleri geciyorsa yaniti engelle.
Yanitta JSON formati, kod parcasi veya teknik yapilandirma bilgisi varsa engelle.
Engellenen yanit yerine: "Ben QRAGY Bot, size teknik destek konusunda yardimci olmak icin buradayim. Size nasil yardimci olabilirim?"

## Turkce Karakter Kontrolu
AI bazen ASCII Turkce donebilir (s->s, c->c, i->i, g->g, u->u, o->o).
Bilinen kelimelerde ASCII varsa duzelt: "yardimci" -> "yardimci", "calismiyor" -> "calismiyor".
Platform isimleri oldugu gibi birak: "QRAGY Bot", "REMOTE_TOOL".

## Konu Disi Icerik Kontrolu
Yanit platform teknik destek kapsami disinda bir konuya deginiyorsa engelle.
Engellenen yanit yerine: "Bu konu teknik destek kapsamimiz disinda kalmaktadir. Platform ile ilgili bir konuda yardimci olabilirim."

## Tekrar Kontrolu
Ardisik iki yanit ayni veya cok benzer icerikteyse ikincisini degistir.
Tekrar eden yanit yerine konuyu ilerletecek bir soru veya yonlendirme yap.
