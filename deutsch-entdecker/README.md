# Deutsch-Entdecker – gemeinsame Online-Wörter (Version 2)

Diese Version basiert auf der hochgeladenen App mit automatischen Übersetzungen. Sie bietet eine zentrale, auf allen Geräten gemeinsame Wörtersammlung, Bilder, Quiz, Aussprache, vier Oberflächensprachen und einen PIN-geschützten Lehrkraftbereich.

## Wichtig: Nicht nur die HTML-Datei hochladen

Die Online-Funktionen benötigen **Netlify Functions** und **Netlify Blobs**. Ein einfacher ZIP-Drag-and-drop-Upload auf Netlify Drop führt normalerweise **keinen npm-Build und keine Function-Installation** aus. Veröffentliche das gesamte Projekt über ein Git-Repository (GitHub → Netlify → Import project) oder die Netlify CLI mit Build/Deploy.

### Schritt für Schritt

1. ZIP entpacken und den **Inhalt** des Projektordners in ein neues GitHub-Repository hochladen (Ordner `public`, `netlify`, Dateien `package.json`, `netlify.toml`).
2. In Netlify das GitHub-Repository über **Add new project → Import an existing project** verbinden. Publish-Verzeichnis: `public`; Netlify erkennt die Functions in `netlify/functions` und installiert `@netlify/blobs` über npm.
3. In Netlify unter **Project configuration → Environment variables** zwei geheime Variablen anlegen, jeweils mit Gültigkeit für **Functions**:
   - `SETUP_SECRET`: ein selbst gewählter zufälliger Einrichtungsschlüssel mit **mindestens 20 Zeichen**. Er wird nur beim allerersten Festlegen des PINs benötigt. Nicht an Kinder weitergeben.
   - `SESSION_SECRET`: eine andere zufällige Zeichenfolge mit **mindestens 32 Zeichen**. Sie signiert sichere Lehrkraft-Sitzungen. Niemals im Browsercode eintragen.
4. **Nach dem Setzen der Variablen neu deployen**, damit sie in den Functions verfügbar sind.
5. Website öffnen, auf „Eigene Wörter & Bilder verwalten“ klicken, Einrichtungsschlüssel und selbst gewählten PIN (6–12 Ziffern) eingeben.
6. Neue Wörter hinzufügen; sie werden in Netlify Blobs gespeichert und sind auf allen Geräten nach dem Laden bzw. spätestens nach 60 Sekunden verfügbar. Kinder benötigen keinen PIN.

## Datenschutz und technische Hinweise

- Die PIN-Prüfung findet serverseitig statt. Der PIN wird nur als gesalzener PBKDF2-Hash gespeichert; die Sitzung nutzt ein signiertes, `HttpOnly`, `Secure`, `SameSite=Strict`-Cookie mit acht Stunden Laufzeit.
- Bilder und Wörter liegen in **siteweiten Netlify Blobs**, nicht nur im Browser. Beim Löschen verschwinden sie aus der gemeinsamen Sammlung.
- Browser-Lernfortschritt (Sterne) und Stimmeneinstellungen bleiben bewusst lokal.
- Für automatische Übersetzungen nutzt die App weiterhin den externen Dienst MyMemory. Eingegebene Wörter werden dorthin gesendet; die Übersetzungen müssen überprüft werden.
- PIN-Rate-Limit ist eine einfache Best-Effort-Sperre; bei einer öffentlich stark frequentierten Anwendung sollte ein professioneller serverseitiger Rate-Limiter ergänzt werden. Für echte Transaktionen und viele gleichzeitige Bearbeiter wäre eine relationale Datenbank geeigneter.
- Nur eine Lehrkraft sollte gleichzeitig Änderungen vornehmen. Die Speicherung ist für eine kleine Wortbibliothek bis 300 Einträge ausgelegt.
- Die erste PIN-Einrichtung erfordert den geheimen `SETUP_SECRET`. Wenn du den PIN verlierst, gibt es in dieser Version keine Selbstbedienungs-Zurücksetzung; der Betreiber muss eine sichere Reset-Funktion ergänzen.
- **Nicht** `netlify/functions` in einen öffentlich ausgelieferten Ordner verschieben.

## Lokale Entwicklung

`npm install`, danach `npx netlify dev` (Netlify CLI benötigt). `index.html` direkt als Datei zu öffnen reicht für die Online-Funktionen nicht aus.
