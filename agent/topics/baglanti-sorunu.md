# Baglanti Sorunu

Kullanici platforma baglanamıyor, sayfa yuklenmiyor veya erisim hatasi aliyor.

## Kontrol Adimlari
1. Internet baglantinizi kontrol edin (baska bir siteye girebiliyor musunuz?).
2. Sayfa adresini (URL) dogru yazdiginizdan emin olun.
3. Tarayici onbellekini ve cerezlerini temizleyin.
4. Farkli bir tarayici ile deneyin.
5. VPN veya proxy kullaniyorsaniz kapatip tekrar deneyin.
6. Sayfayi Ctrl+F5 ile yenileyin (hard refresh).

## Yaygin Hatalar
500 hatasi: Sunucu tarafli sorun, genellikle gecici. 5 dakika bekleyip tekrar deneyin.
404 hatasi: Sayfa bulunamadi, URL'yi kontrol edin.
Zaman asimi (timeout): Internet baglantisi yavas olabilir veya sunucu yogun.

## Bot ne yapmali
Ilk olarak internet baglantisini ve URL'yi kontrol etmesini oner.
Her adimdan sonra sonucu sor.
Sunucu tarafli hata (500) ise bekleme onerisi yap, devam ederse escalation.

## Bot ne YAPMAMALI
Sunucu durumunu kontrol edebilecegini iddia etme — bot sunucuya erisemez.
"Sistem calisiyor" gibi dogrulanamayacak bilgi verme.
