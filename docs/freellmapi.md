# FreeLLMAPI hızlı başlangıç (Türkçe)

FreeLLMAPI, ücretsiz LLM sağlayıcılarını (Gemini, Groq, OpenRouter ve diğerleri)
tek bir **OpenAI uyumlu API** arkasında toplayan bir ağ geçididir. Sağlayıcı
anahtarlarınızı bir kez eklersiniz, ardından tek bir **birleşik anahtar** ile
istek atarsınız. Router uygun modeli seçer; bir sağlayıcı hata verir veya
limite takılırsa sıradakine geçer.

Ayrıntılı ve güncel bilgi için İngilizce belgeler esastır:
[docs/en/README.md](en/README.md).

## 1. Kurulum

### Tek satırlık kurulum (Docker gerekir)

```bash
curl -fsSL https://freellmapi.co/install.sh | bash
```

`~/freellmapi` klasörünü oluşturur, şifreleme anahtarını üretir ve konteyneri
başlatır. Tekrar çalıştırmak güvenlidir: `.env` dosyanız korunur, imaj
güncellenir. Windows'ta en kolay yol
[Releases](https://github.com/tashfeenahmed/freellmapi/releases/latest)
sayfasındaki `.exe` masaüstü uygulamasıdır.

### Docker Compose

```bash
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi
printf "ENCRYPTION_KEY=%s\nPORT=3001\n" "$(openssl rand -hex 32)" > .env
docker compose up -d
```

### Yerel geliştirme (Node.js 20+)

```bash
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi
npm install
printf "ENCRYPTION_KEY=%s\nPORT=3001\n" "$(openssl rand -hex 32)" > .env
npm run dev
```

Geliştirme arayüzü http://localhost:5173 adresindedir. Docker kurulumunda
panel ve API birlikte http://localhost:3001 adresinde çalışır.

> `ENCRYPTION_KEY` sağlayıcı anahtarlarınızı şifreler. Kaybetmeyin ve doğrudan
> değiştirmeyin; değiştirmeniz gerekirse
> [anahtar döndürme adımlarını](en/install/01-install.md#rotating-the-encryption-key)
> izleyin.

## 2. Paneli ayarlama

1. **Keys** sayfasında sağlayıcı API anahtarlarınızı ekleyin (ör. Google AI
   Studio, Groq, OpenRouter).
2. **Fallback Chain** sayfasında modellerin hangi sırayla deneneceğini ayarlayın.
3. **Keys** sayfasının üstündeki birleşik anahtarı (`freellmapi-...`)
   kopyalayın. İstemcilerde kullanacağınız anahtar budur.

## 3. API'yi çağırma

Temel adres `http://localhost:3001/v1`. OpenAI uyumlu her istemci çalışır.

**Python**

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3001/v1",
    api_key="freellmapi-birlesik-anahtariniz",
)

resp = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Merhaba!"}],
)
print(resp.choices[0].message.content)
```

**curl**

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer freellmapi-birlesik-anahtariniz" \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Merhaba"}]}'
```

### Model seçimi

| `model` değeri | Davranış |
| --- | --- |
| `auto` | Fallback zincirinizi sırayla izler |
| `auto:fast` | Ölçülen hıza göre seçer |
| `auto:smart` | En yetenekli modelleri öne alır |
| `auto:reliable` | Son başarı oranına göre seçer |
| `auto:balanced` | Varsayılan karma (önce güvenilirlik) |
| ör. `gemini-2.5-flash` | Belirli bir modeli kullanır |

Her yanıttaki `X-Routed-Via` başlığı isteği hangi sağlayıcı ve modelin
karşıladığını gösterir. Sağlayıcı değiştiyse `X-Fallback-Trail` başlığı
başarısız olan adımları ve nedenlerini listeler.

Tüm uç noktalar için interaktif doküman: http://localhost:3001/v1/docs

## 4. Kodlama ajanlarını bağlama

```bash
npx freellmapi setup-<ajan> --url http://localhost:3001 --api-key <birlesik-anahtar>
```

Örnekler: `setup-claude` (Claude Code), `setup-codex`, `setup-cline`,
`setup-aider`, `setup-opencode`, `setup-continue`. Önce değişiklikleri görmek
için `--dry-run` ekleyin. Paneldeki **Agents** sayfası aynı komutları
anahtarınız doldurulmuş olarak gösterir. Tam liste:
[Supported agents](en/clients/02-supported-agents.md).

Claude Code sunucunun kök adresini (`http://localhost:3001`) alır; OpenAI uyumlu
diğer ajanlar `/v1` adresini kullanır.

## 5. Sık sorulanlar

**Başka bir cihazdan panele erişemiyorum.** Docker varsayılan olarak yalnızca
`127.0.0.1` adresini dinler. Yerel ağa açmak için:

```bash
HOST_BIND=0.0.0.0 docker compose up -d
```

Bunu yalnızca güvenilir bir ağda yapın; erişimi koruyan tek şey birleşik
anahtardır.

**Sağlayıcılara konteynerden erişilemiyor.** Konteynerin içinde `127.0.0.1`
konteynerin kendisidir. Ana makinedeki bir proxy'yi kullanıyorsanız
`PROXY_URL=socks5h://host.docker.internal:7890` gibi bir adres verin.

**Şifremi unuttum.** Giriş sayfasında **Forgot password?** → **Send reset code**
seçin. Kod sunucu günlüğüne yazılır ve 15 dakika geçerlidir. Masaüstü
uygulamasında şifre yoktur.

**Günlükler nerede?**

| Kurulum | Günlük |
| --- | --- |
| Docker Compose / tek satırlık kurulum | `docker compose logs -f freellmapi` |
| `npm run dev` | Sunucunun çalıştığı terminal |
| Masaüstü uygulaması | Tepsi simgesi → **Open Logs Folder** |

## Daha fazlası

- [Kurulum ve dağıtım](en/install/01-install.md)
- [API referansı](en/api/01-rest-api.md)
- [İstemciler ve kodlama ajanları](en/clients/01-agent-clients.md)
- [Mimari](en/architecture/00-high-level-index.md)
