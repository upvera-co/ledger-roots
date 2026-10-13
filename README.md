# Upvera · günlük kökler

Upvera'da olan her şey — Prime, yorum, takip, kanat ol ve kanadını çek — dakikalık bloklara mühürlenir. Her günün sonunda o günün
bloklarının özetlerinden tek bir **günlük kök** çıkar; o kök buraya yazılır ve [OpenTimestamps](https://opentimestamps.org) ile Bitcoin'e
**zaman damgası** alır. Böylece Upvera geçmişini sonradan sessizce değiştiremez: değiştirirse buradaki kökle tutmaz, damga da geriye
alınamaz.

Burada kişisel veri yok: yalnız özetler. Her gün dosyası bir öncekinin özetini taşır (zincir), ilk gün `genesis.json`'a bağlıdır.

## Kendin doğrula

```bash
node tools/days.mjs verify            # bütün günlerin zinciri ve özetleri (ağ yok)
pip install opentimestamps-client     # isteğe bağlı
ots verify days/2026/10/2026-10-12.json.ots
```

Kendi etkileşiminin bu köklerden birinin içinde olduğunu **Doğrula** sayfası tarayıcında, sunucuya güvenmeden kanıtlar: sayfa günün
dosyasını bu depodan kendisi çeker ve kanıttaki kayıtla bayt bayt karşılaştırır (dosya yoksa hüküm "yayımlanmış köke bağlanmadı" olur).
Para makbuzlarının kanıtı yalnız uygulamada, kendi oturumunda gösterilir.

## Dal koruması (depoyu kuran için)

`main` için bir kural kümesi (Settings → Rules → Rulesets): **force push engelli · silme engelli · doğrusal geçmiş**. Yazan yalnız
`publish` iş akışıdır (`GITHUB_TOKEN`, `contents: write`); iş akışının eylemleri commit SHA'sıyla sabittir. Böylece yayımlanmış bir gün
dosyası sonradan değiştirilemez — değişirse Upvera'nın teyidi (`mismatch`) ve OpenTimestamps damgası bunu gösterir.

Biçim: `days/YYYY/MM/YYYY-MM-DD.json` = kanonik JSON (`{t:"d", v:2, day, prev, root, tip, checkpoint, rules_hash}`) + satır sonu; gün
özeti = `sha256("upvera/day/v1\n" ‖ JSON)`; kök = günün blok özetlerinin Merkle kökü (RFC 6962); uç = günün son bloğunun özeti; kontrol
noktası = günün sonundaki bütün hesap bakiyelerinin özeti. Dosyada **sayı yok** (blok, olay ya da para hareketi sayısı yayımlanmaz) —
yalnız kökler. `genesis.json` = zincirin çapası (`{hash, header:{t:"genesis", v:2, anchor, rule, at}}`).

---

# Upvera · daily roots

Everything on Upvera — Prime, comments, follows, lending and folding a wing — is sealed into minute blocks. At the end of each day the
day's block digests yield a single **daily root**; it is written here and **timestamped** on Bitcoin with OpenTimestamps. Upvera cannot
quietly rewrite its history afterwards: a rewrite would no longer match the root here, and the timestamp cannot be taken back.

No personal data here — digests only. Each day file carries the previous day's digest (a chain); the first day links to `genesis.json`.

Format: `days/YYYY/MM/YYYY-MM-DD.json` = canonical JSON (`{t:"d", v:2, day, prev, root, tip, checkpoint, rules_hash}`) + newline; day
digest = `sha256("upvera/day/v1\n" ‖ JSON)`; root = Merkle root of the day's block digests (RFC 6962); tip = the day's last block digest;
checkpoint = digest of every account balance at the end of the day. **No counts** in the file (no number of blocks, interactions or
money movements is published) — roots only. Verify with `node tools/days.mjs verify` (no network).
