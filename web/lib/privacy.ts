// Privacy notice (tietosuojaseloste) in Finnish and English, shown at /privacy.
// PLACEHOLDERS: the controller's name, business ID, address and contact person are not confirmed yet.
// Replace the [square-bracket] values in CONTROLLER when the company exists, and check retention times with the accountant.

type L = { fi: string; en: string };

export const CONTROLLER = {
  name: "[Yrityksen nimi / Company name]",
  businessId: "[Y-tunnus / Business ID]",
  address: "[Katuosoite, postinumero ja kaupunki / Street address, postcode and city]",
  email: "[tietosuoja@… / privacy@…]",
  contact: "[Yhteyshenkilö / Contact person]"
};

export const PRIVACY_UPDATED = "2026-10-06";

export const PRIVACY: { title: L; body: L[]; list?: L[] }[] = [
  {
    title: { fi: "Rekisterinpitäjä", en: "Controller" },
    body: [
      {
        fi: "Henkilötietojasi käsittelee alla mainittu yritys. Tietosuojaa koskevat kysymykset ja pyynnöt voit lähettää alla olevaan sähköpostiosoitteeseen.",
        en: "The company below processes your personal data. Send questions and requests about your data to the email address below."
      }
    ]
  },
  {
    title: { fi: "Mitä tietoja keräämme", en: "What we collect" },
    body: [{ fi: "Keräämme vain tiedot, joita tarvitsemme tarjoukseen, toimitukseen ja laskutukseen:", en: "We only collect what we need for the quote, the delivery and the invoice:" }],
    list: [
      { fi: "Yhteystiedot: nimi, puhelinnumero, sähköposti ja kohteen osoite.", en: "Contact details: name, phone number, email and site address." },
      { fi: "Kohteen tiedot: talon mitat, kerrokset, katto, kartta- ja rakennusrekisteritiedot sekä lähettämäsi piirustukset tai valokuvat.", en: "Site details: house size, floors, roof, map and building register data, and any drawings or photos you send." },
      { fi: "Tilaus: päivät, hinta, viestit kanssamme, muutospyynnöt, laskut ja maksut.", en: "The order: dates, price, messages with us, change requests, invoices and payments." },
      { fi: "Työmaa: asentajien kuvat telineestä, tarkastuspöytäkirja ja allekirjoituksesi luovutuksessa.", en: "On site: the crew's photos of the scaffold, the inspection record and your signature at handover." },
      { fi: "Yhteydenottolomake: nimi, sähköposti, puhelin ja viesti.", en: "Contact form: name, email, phone and your message." },
      { fi: "Arvio: tähdet, kommentti ja lupasi julkaisuun.", en: "Rating: stars, comment and whether we may publish it." }
    ]
  },
  {
    title: { fi: "Miksi ja millä perusteella", en: "Why, and on what basis" },
    body: [],
    list: [
      { fi: "Tarjous, tilaus, toimitus ja nouto – sopimuksen valmistelu ja täyttäminen.", en: "Quote, order, delivery and pickup – preparing and performing our contract with you." },
      { fi: "Laskutus ja kirjanpito – lakisääteinen velvoite.", en: "Invoicing and bookkeeping – legal obligation." },
      { fi: "Telineen tarkastus ja työturvallisuus – lakisääteinen velvoite.", en: "Scaffold inspection and work safety – legal obligation." },
      { fi: "Yhteydenottoihin vastaaminen ja palvelun kehittäminen – oikeutettu etu.", en: "Answering messages and improving our service – legitimate interest." },
      { fi: "Arvion julkaiseminen verkkosivuilla – suostumus, jonka voit perua milloin tahansa.", en: "Publishing your rating on the website – your consent, which you can withdraw at any time." }
    ]
  },
  {
    title: { fi: "Kuka tietoja käsittelee", en: "Who handles the data" },
    body: [
      {
        fi: "Tietojasi käsittelevät vain toimistomme ja asentajamme. Käytämme palveluntarjoajia, jotka käsittelevät tietoja puolestamme:",
        en: "Only our office and crews handle your data. We use service providers who process data on our behalf:"
      }
    ],
    list: [
      { fi: "Palvelin ja tietokanta (EU).", en: "Server and database (EU)." },
      { fi: "Sähköposti- ja tekstiviestipalvelu viestien lähettämiseen.", en: "Email and text message services to send you messages." },
      { fi: "OpenStreetMap ja Suomen ympäristökeskuksen rakennusrekisteri: niille lähetetään vain kirjoittamasi osoite talon mittojen hakemiseksi.", en: "OpenStreetMap and the Finnish building register (Syke): only the address you type is sent, to look up the house." },
      { fi: "OpenAI (Yhdysvallat): vain jos lähetät piirustuksen tai kuvan luettavaksi. Kuvaa käytetään vain mittojen lukemiseen.", en: "OpenAI (United States): only if you send a drawing or photo to be read. The image is used only to read the measurements." },
      { fi: "Tilitoimisto laskujen ja kirjanpidon osalta.", en: "Our accountant, for invoices and bookkeeping." }
    ]
  },
  {
    title: { fi: "Siirrot EU:n ulkopuolelle", en: "Transfers outside the EU" },
    body: [
      {
        fi: "Jos palveluntarjoaja sijaitsee EU:n ulkopuolella (esim. OpenAI), siirto perustuu Euroopan komission vakiosopimuslausekkeisiin tai tietosuojakehykseen.",
        en: "If a provider is outside the EU (for example OpenAI), the transfer relies on the European Commission's standard contractual clauses or the Data Privacy Framework."
      }
    ]
  },
  {
    title: { fi: "Kuinka kauan säilytämme tietoja", en: "How long we keep data" },
    body: [],
    list: [
      { fi: "Tilaukset, laskut ja niiden liitteet: kuusi vuotta tilikauden päättymisestä (kirjanpitolaki).", en: "Orders, invoices and their attachments: six years after the end of the financial year (Accounting Act)." },
      { fi: "Tarkastuspöytäkirjat ja työmaakuvat: tilauksen ajan ja sen jälkeen niin kauan kuin työturvallisuus- ja vastuusyistä tarvitaan.", en: "Inspection records and site photos: for the order and afterwards as long as needed for work safety and liability." },
      { fi: "Yhteydenotot, joista ei tullut tilausta: 12 kuukautta.", en: "Contact messages that didn't lead to an order: 12 months." },
      { fi: "Julkaistu arvio: kunnes perut suostumuksesi.", en: "Published rating: until you withdraw your consent." }
    ]
  },
  {
    title: { fi: "Oikeutesi", en: "Your rights" },
    body: [
      {
        fi: "Voit pyytää pääsyä tietoihisi, niiden oikaisemista tai poistamista, käsittelyn rajoittamista ja tietojen siirtämistä, sekä vastustaa oikeutettuun etuun perustuvaa käsittelyä. Lakisääteisesti säilytettäviä tietoja emme voi poistaa ennen säilytysajan päättymistä.",
        en: "You can ask to see, correct or delete your data, restrict its use, or get it in a portable form, and you can object to processing based on legitimate interest. We can't delete data we must keep by law before the retention time ends."
      },
      {
        fi: "Jos katsot, että tietojasi käsitellään lainvastaisesti, voit tehdä valituksen tietosuojavaltuutetulle (tietosuoja.fi).",
        en: "If you think your data is handled unlawfully, you can complain to the Data Protection Ombudsman (tietosuoja.fi)."
      }
    ]
  },
  {
    title: { fi: "Hinnat ja automaattinen laskenta", en: "Prices and automatic calculation" },
    body: [
      {
        fi: "Verkkosivun hinta lasketaan automaattisesti antamistasi talon tiedoista. Toimisto tarkistaa jokaisen tilauksen ennen vahvistusta, joten automaattinen laskenta ei yksin ratkaise mitään.",
        en: "The website price is calculated automatically from the house details. The office checks every order before confirming it, so no decision is made by the calculation alone."
      }
    ]
  },
  {
    title: { fi: "Evästeet ja selaimen tallennus", en: "Cookies and browser storage" },
    body: [
      {
        fi: "Verkkosivu ei käytä seuranta- tai mainosevästeitä. Selaimeesi tallennetaan vain kielivalintasi. Toimisto ja asentajien sovellus käyttävät kirjautumiseen välttämätöntä evästettä.",
        en: "The website uses no tracking or advertising cookies. Only your language choice is stored in your browser. The office and the crew app use a cookie that is needed to stay logged in."
      }
    ]
  }
];
