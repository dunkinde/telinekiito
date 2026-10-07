// Terms of service (/terms) and pre-contract information for consumers (/consumer-info), in Finnish and English.
//
// DRAFT FOR A LAWYER'S REVIEW – NOT LEGAL ADVICE. These texts were drafted without a lawyer and must be checked
// against the Consumer Protection Act (kuluttajansuojalaki 38/1978, chapters 6 and 8) before they are relied on.
// Open points for the reviewer are marked [square brackets] or listed in the PR description.
// While TERMS_DRAFT is true, both pages show a "draft" notice. When the reviewed texts go live, set it to false,
// update TERMS_UPDATED, and bump TERMS_VERSION in lib/orders.js (it is stored on every order the customer accepts).
//
// Company details are the same PLACEHOLDERS as the privacy notice (CONTROLLER in lib/privacy.ts); phone from lib/site.ts.

import { CONTROLLER } from "./privacy";
import { SITE } from "./site";

type L = { fi: string; en: string };
export type LegalSection = { id?: string; title: L; body?: L[]; list?: L[]; company?: boolean };

export const TERMS_DRAFT = true;
export const TERMS_UPDATED = "2026-10-07";

/** Company details for the pre-contract information (Consumer Protection Act 6:9: name, address, phone, email). */
export const COMPANY = {
  name: CONTROLLER.name,
  businessId: CONTROLLER.businessId,
  address: CONTROLLER.address,
  phone: SITE.phone,
  email: SITE.email
};

/* ---------------------------------------------------------------- Terms of service ---------------------------------------------------------------- */

export const TERMS: LegalSection[] = [
  {
    id: "scope",
    title: { fi: "1. Soveltaminen ja palvelu", en: "1. Scope and the service" },
    body: [
      {
        fi: "Näitä ehtoja sovelletaan, kun tilaat telineet TelineKiitolta (jäljempänä ”me”) verkkosivuilta, puhelimitse tai toimistolta. Yritysasiakkaita koskevat lisäksi kohdan 14 poikkeukset.",
        en: "These terms apply when you order scaffolding from TelineKiito (“we”) on the website, by phone or from the office. Section 14 adds exceptions for business customers."
      },
      { fi: "Palveluun kuuluvat:", en: "The service includes:" }
    ],
    list: [
      { fi: "telineiden vuokra sovituksi vuokra-ajaksi,", en: "rental of the scaffolding for the agreed rental period," },
      { fi: "kuljetus kohteeseen ja takaisin,", en: "delivery to the site and back," },
      { fi: "asennus, käyttöönottotarkastus ja tarkastuspöytäkirja,", en: "installation, the inspection before first use and the inspection record," },
      { fi: "purku vuokra-ajan päätyttyä,", en: "dismantling at the end of the rental," },
      { fi: "valittaessa sääsuojapeite telineen ulkopintaan ja tilapäinen sääkatto (vuokra, asennus ja purku).", en: "if chosen, weather sheeting on the outer face of the scaffold and a temporary roof (rental, installation and dismantling)." }
    ]
  },
  {
    id: "binding",
    title: { fi: "2. Tilaus ja sopimuksen syntyminen", en: "2. Ordering and when the contract is made" },
    body: [
      {
        fi: "Verkkosivujen tilaus on tilauspyyntö. Sopimus syntyy, kun toimistomme vahvistaa tilauksen sinulle sähköpostilla tai tekstiviestillä (tilausvahvistus). Ennen vahvistusta kumpikaan osapuoli ei ole sidottu tilaukseen.",
        en: "An order on the website is an order request. The contract is made when our office confirms the order to you by email or text message (order confirmation). Until then, neither of us is bound by the order."
      },
      {
        fi: "Lähetämme tilausvahvistuksen ja nämä ehdot sekä ennakkotiedot pysyvällä tavalla (sähköposti tai tulostettava vahvistus seurantasivulla).",
        en: "We send the order confirmation, these terms and the pre-contract information in a durable form (email, or a printable confirmation on the tracking page)."
      }
    ]
  },
  {
    id: "price",
    title: { fi: "3. Hinta ja hinnan tarkistus", en: "3. Price and price check" },
    body: [
      {
        fi: "Hinnat sisältävät arvonlisäveron (tilaushetken verokanta). Verkkosivujen hinta lasketaan automaattisesti antamistasi talon tiedoista ja sisältää telineen vuokran, kuljetuksen, asennuksen, tarkastuksen ja purun sekä valitut lisät.",
        en: "Prices include VAT (the rate at the time of ordering). The website price is calculated automatically from the house details you give and includes rent, delivery, installation, inspection, dismantling and the extras you chose."
      },
      {
        fi: "Toimisto tarkistaa jokaisen tilauksen ennen vahvistusta (esim. karttakuva, rakennusrekisteri, valokuvat). Jos talon koko, muoto tai kohteen olosuhteet poikkeavat ilmoitetusta, voimme muuttaa hintaa. Lähetämme silloin uuden hinnan, eikä tilaus sido sinua ennen kuin hyväksyt sen. Jos et hyväksy uutta hintaa, tilaus perutaan veloituksetta.",
        en: "The office checks every order before confirming it (for example the satellite view, the building register and photos). If the size or shape of the house or the site conditions differ from what was given, we may change the price. We then send you the new price, and the order doesn't bind you until you accept it. If you don't accept it, the order is cancelled free of charge."
      },
      {
        fi: "Jos kohteessa paljastuu asennuksen yhteydessä seikkoja, joita ei voitu tietää etukäteen (esim. ilmoittamaton sähköjohto tai pehmeä maapohja), sovimme lisätyöstä ja sen hinnasta kanssasi ennen sen tekemistä.",
        en: "If something comes up during installation that couldn't be known beforehand (for example an unreported power line or soft ground), we agree any extra work and its price with you before doing it."
      },
      {
        fi: "Maksu: lasku, maksuaika [14] päivää laskun päiväyksestä, ellei toisin sovita. Myöhästyneestä maksusta peritään korkolain mukainen viivästyskorko ja kohtuulliset perimiskulut.",
        en: "Payment: invoice, due [14] days from the invoice date unless agreed otherwise. Late payments carry penalty interest under the Interest Act and reasonable collection costs."
      }
    ]
  },
  {
    id: "duties",
    title: { fi: "4. Asiakkaan velvollisuudet kohteessa", en: "4. Your duties on site" },
    body: [{ fi: "Asiakas huolehtii, että:", en: "You make sure that:" }],
    list: [
      {
        fi: "kuorma-autolla on esteetön pääsy kohteen lähelle ja telineen paikalla on vapaata, riittävän kantavaa maata noin 1,5 m seinästä (kasvit, kalusteet ja irtotavarat siirretty),",
        en: "a truck can get close to the site, and the ground along the walls (about 1.5 m out) is clear and firm enough (plants, furniture and loose items moved),"
      },
      {
        fi: "kerrot etukäteen sähköjohdoista, maakaapeleista, kaivoista ja muista rakenteista telineen alueella. Ilmajohdot on tarvittaessa tehtävä jännitteettömiksi tai suojattava sähköverkkoyhtiön kanssa ennen asennusta,",
        en: "you tell us beforehand about power lines, buried cables, wells and other structures where the scaffold goes. Overhead lines must, where needed, be switched off or covered together with the electricity network company before installation,"
      },
      {
        fi: "tarvittavat luvat ovat kunnossa: esimerkiksi kadun tai muun yleisen alueen käyttölupa ja naapurin suostumus, jos teline tulee naapurin puolelle,",
        en: "the permits needed are in place, for example a permit to use a street or other public area and the neighbour's consent if the scaffold stands on their side,"
      },
      {
        fi: "telinettä ei muuteta, siirretä eikä siitä poisteta osia (esim. kaiteita, tasoja tai ankkureita). Muutokset tekee vain TelineKiito; pyydä ne seurantasivulta tai toimistolta,",
        en: "nobody alters or moves the scaffold or removes parts from it (for example guardrails, decks or anchors). Only TelineKiito makes changes – ask for them on the tracking page or from the office,"
      },
      {
        fi: "telinettä käytetään sen kuormaluokan ja käyttöohjeen mukaisesti, ja sen käyttäjät (esim. kattourakoitsija) tekevät käytön aikaiset tarkastukset,",
        en: "the scaffold is used within its load class and instructions, and its users (for example your roofer) carry out the checks required while it is in use,"
      },
      {
        fi: "ilmoitat meille heti, jos teline vaurioituu, siirtyy tai sen kunto muuttuu (esim. myrskyn jälkeen). Vaurioitunutta telinettä ei saa käyttää.",
        en: "you tell us straight away if the scaffold is damaged, moves or changes (for example after a storm). A damaged scaffold must not be used."
      }
    ]
  },
  {
    id: "schedule",
    title: { fi: "5. Aikataulu", en: "5. Schedule" },
    body: [
      {
        fi: "Asennuspäivä on se, joka tilausvahvistuksessa lukee. Kova tuuli, ukkonen tai muu sää voi siirtää asennusta tai purkua turvallisuussyistä; ilmoitamme siitä heti ja sovimme uuden ajan. Sään vuoksi siirtyneiltä päiviltä ei peritä vuokraa ennen luovutusta.",
        en: "Installation happens on the date in the order confirmation. Strong wind, thunder or other weather can move installation or dismantling for safety reasons; we tell you straight away and agree a new time. No rent is charged for days lost to weather before handover."
      }
    ]
  },
  {
    id: "rental",
    title: { fi: "6. Vuokra-aika ja jatkaminen", en: "6. Rental period and extensions" },
    body: [
      {
        fi: "Vuokra-aika alkaa, kun teline on asennettu, tarkastettu ja luovutettu, ja päättyy sovittuna päivänä. Lyhin vuokra-aika on [7] päivää.",
        en: "The rental starts when the scaffold is installed, inspected and handed over, and ends on the agreed date. The minimum rental is [7] days."
      },
      {
        fi: "Voit pyytää jatkoa tai lyhennystä seurantasivulta. Näet uuden hinnan ennen pyynnön lähettämistä, ja toimisto vahvistaa muutoksen. Jatkopäivät hinnoitellaan tilauksen päivävuokralla.",
        en: "You can ask for a longer or shorter rental on the tracking page. You see the new price before sending the request, and the office confirms the change. Extra days are charged at the order's daily rent."
      },
      {
        fi: "Muistutamme sinua ennen vuokra-ajan päättymistä. Jos teline on vielä käytössä tai noutoa ei voida tehdä sinusta johtuvasta syystä, vuokra jatkuu samalla päivähinnalla noutoon asti.",
        en: "We remind you before the rental ends. If the scaffold is still in use, or it can't be collected for a reason on your side, rent continues at the same daily price until it is collected."
      }
    ]
  },
  {
    id: "damage",
    title: { fi: "7. Vahingot ja puuttuvat osat", en: "7. Damage and missing parts" },
    body: [
      {
        fi: "Teline pysyy TelineKiiton omaisuutena. Asiakas vastaa vuokra-aikana telineen osien katoamisesta ja vaurioitumisesta, ellei vahinko johdu tavanomaisesta kulumisesta tai seikasta, johon asiakas tai hänen käyttämänsä urakoitsijat eivät ole voineet vaikuttaa.",
        en: "The scaffold remains TelineKiito's property. During the rental you are responsible for lost and damaged parts unless the damage is normal wear or something neither you nor your contractors could influence."
      },
      {
        fi: "Osat lasketaan purun yhteydessä ja puutteet kirjataan. Puuttuvista tai korjauskelvottomista osista veloitetaan [voimassa olevan hinnaston mukainen jälleenhankintahinta], korjattavista osista kohtuulliset korjauskulut. Saat erittelyn ennen laskua. Suosittelemme tarkistamaan kotivakuutuksen kattavuuden.",
        en: "Parts are counted at dismantling and anything missing is recorded. Missing or unrepairable parts are charged at [the replacement price in the current price list], repairable ones at reasonable repair cost. You get an itemised list before the invoice. We recommend checking what your home insurance covers."
      }
    ]
  },
  {
    id: "cancel",
    title: { fi: "8. Peruuttaminen", en: "8. Cancellation" },
    body: [
      {
        fi: "Kuluttajalla on 14 päivän peruuttamisoikeus sopimuksen syntymisestä; ehdot ja vaikutukset kerrotaan ennakkotiedoissa. Peruuttamisajan jälkeenkin voit perua tilauksen ennen asennusta ilmoittamalla siitä toimistolle. Silloin voimme veloittaa jo tehdyn työn ja syntyneet kulut (esim. kuljetus) sekä muun peruutuksesta aiheutuneen vahingon lain sallimissa rajoissa.",
        en: "Consumers have a 14-day right of withdrawal from when the contract is made; the conditions and effects are set out in the pre-contract information. After that period you can still cancel before installation by telling the office. We may then charge for work already done and costs already incurred (for example delivery) and other loss caused by the cancellation, as far as the law allows."
      },
      {
        fi: "Voimme perua tilauksen, jos turvallista asennusta ei voida tehdä (esim. jännitteistä ilmajohtoa ei saada suojattua) tai luvat puuttuvat. Palautamme tällöin jo maksetut summat lukuun ottamatta tekemäämme työtä, joka johtuu asiakkaan antamista virheellisistä tiedoista.",
        en: "We may cancel the order if the scaffold can't be installed safely (for example a live overhead line can't be covered) or permits are missing. We then refund what you paid, except for work caused by incorrect information you gave."
      }
    ]
  },
  {
    id: "liability",
    title: { fi: "9. Vastuu", en: "9. Liability" },
    body: [
      {
        fi: "Vastaamme siitä, että teline on asennettu valmistajan ohjeiden ja työturvallisuusmääräysten mukaisesti, tarkastettu ennen käyttöönottoa ja luovutushetkellä kunnossa. Kuluttajan oikeudet viivästys- ja virhetilanteissa (mm. hinnanalennus, virheen korjaus, sopimuksen purku ja vahingonkorvaus) määräytyvät kuluttajansuojalain mukaan, eikä näillä ehdoilla rajoiteta niitä.",
        en: "We are responsible for the scaffold being installed according to the manufacturer's instructions and work safety rules, inspected before first use and in good order at handover. A consumer's rights in case of delay or defect (including a price reduction, repair, cancelling the contract and damages) follow the Consumer Protection Act, and these terms do not limit them."
      },
      {
        fi: "Emme vastaa vahingoista, jotka johtuvat telineen muuttamisesta, ylikuormittamisesta tai ohjeiden vastaisesta käytöstä, asiakkaan antamista virheellisistä tiedoista tai ylivoimaisesta esteestä.",
        en: "We are not liable for damage caused by altering or overloading the scaffold or using it against the instructions, by incorrect information you gave, or by force majeure."
      }
    ]
  },
  {
    id: "complaints",
    title: { fi: "10. Reklamaatiot", en: "10. Complaints" },
    body: [
      {
        fi: "Ilmoita virheestä kohtuullisessa ajassa sen havaitsemisesta seurantasivun viestillä, sähköpostilla tai puhelimitse. Turvallisuuteen liittyvästä viasta soita heti, äläkä käytä telinettä ennen kuin olemme korjanneet sen. Vastaamme reklamaatioon [viiden arkipäivän] kuluessa.",
        en: "Tell us about a defect within a reasonable time of noticing it, by message on the tracking page, by email or by phone. For a safety problem, call straight away and don't use the scaffold until we have fixed it. We answer complaints within [five working days]."
      }
    ]
  },
  {
    id: "disputes",
    title: { fi: "11. Erimielisyydet", en: "11. Disputes" },
    body: [
      {
        fi: "Pyrimme ratkaisemaan erimielisyydet ensin neuvottelemalla. Kuluttaja voi pyytää maksutonta neuvontaa kuluttajaneuvonnasta (kuluttajaneuvonta.fi) ja viedä asian kuluttajariitalautakunnan käsiteltäväksi (kuluttajariita.fi). Lautakunnan ratkaisut ovat suosituksia. Kuluttaja voi nostaa kanteen myös kotipaikkansa käräjäoikeudessa.",
        en: "We try to settle any disagreement by talking first. A consumer can get free advice from the consumer advisory service (kuluttajaneuvonta.fi) and take the matter to the Consumer Disputes Board (Kuluttajariitalautakunta, kuluttajariita.fi). The Board's decisions are recommendations. A consumer can also take the matter to the district court of their home municipality."
      }
    ]
  },
  {
    id: "law",
    title: { fi: "12. Sovellettava laki", en: "12. Governing law" },
    body: [
      {
        fi: "Sopimukseen sovelletaan Suomen lakia. Jos kieliversiot poikkeavat toisistaan, suomenkielinen versio on ensisijainen.",
        en: "The contract is governed by Finnish law. If the language versions differ, the Finnish version prevails."
      }
    ]
  },
  {
    id: "changes",
    title: { fi: "13. Ehtojen muuttaminen", en: "13. Changes to these terms" },
    body: [
      {
        fi: "Tilaukseen sovelletaan ehtoja, jotka olivat voimassa, kun hyväksyit ne tilausta tehdessäsi. Tallennamme hyväksymäsi version tilaukseen.",
        en: "Your order follows the terms in force when you accepted them while ordering. We store the version you accepted with the order."
      }
    ]
  },
  {
    id: "business",
    title: { fi: "14. Yritysasiakkaat", en: "14. Business customers" },
    body: [
      {
        fi: "Kun tilaaja on yritys tai muu elinkeinonharjoittaja, kuluttajansuojalakia, peruuttamisoikeutta eikä kuluttajariitalautakuntaa koskevia kohtia sovelleta. Lisäksi:",
        en: "When the customer is a company or other business, the parts about the Consumer Protection Act, the right of withdrawal and the Consumer Disputes Board do not apply. In addition:"
      }
    ],
    list: [
      { fi: "Kirjallinen yritysasiakassopimus ja sovitut alennukset menevät näiden ehtojen edelle.", en: "A written business account agreement and agreed discounts take precedence over these terms." },
      { fi: "Hinnat voidaan ilmoittaa myös arvonlisäverottomina; laskulle lisätään voimassa oleva arvonlisävero.", en: "Prices may also be quoted without VAT; VAT at the current rate is added to the invoice." },
      { fi: "Asiakas vastaa työmaan turvallisuuden yhteensovittamisesta (esim. päätoteuttajana) ja telineen käytönaikaisista tarkastuksista.", en: "You are responsible for coordinating site safety (for example as principal contractor) and for the checks required while the scaffold is in use." },
      { fi: "Reklamaatiot on tehtävä kirjallisesti [7] päivän kuluessa virheen havaitsemisesta.", en: "Complaints must be made in writing within [7] days of noticing the defect." },
      { fi: "Vastuumme rajoittuu tilauksen hintaan, emmekä vastaa välillisistä vahingoista (esim. työn keskeytyminen tai saamatta jäänyt voitto), ellei vahinkoa ole aiheutettu tahallisesti tai törkeällä huolimattomuudella.", en: "Our liability is limited to the price of the order, and we are not liable for indirect loss (for example work stoppage or lost profit) unless caused intentionally or by gross negligence." },
      { fi: "Erimielisyydet ratkaistaan [Helsingin käräjäoikeudessa].", en: "Disputes are settled in [the Helsinki District Court]." }
    ]
  }
];

/* ------------------------------------------------- Pre-contract information (Consumer Protection Act ch. 6) ------------------------------------------------- */

export const CONSUMER_INFO: LegalSection[] = [
  {
    id: "trader",
    title: { fi: "Palveluntarjoaja", en: "The trader" },
    company: true,
    body: [
      {
        fi: "Nämä tiedot annetaan kuluttajansuojalain 6 luvun mukaisesti ennen kuin teet tilauksen etämyyntinä (verkkosivuilla tai puhelimitse).",
        en: "This information is given under chapter 6 of the Finnish Consumer Protection Act before you place an order at a distance (on the website or by phone)."
      }
    ]
  },
  {
    id: "service",
    title: { fi: "Palvelun pääominaisuudet", en: "Main features of the service" },
    body: [
      {
        fi: "Telineiden vuokra kuljetuksineen, asennuksineen, käyttöönottotarkastuksineen ja purkuineen omakotitaloon tai muuhun rakennukseen, valinnaisesti sääsuojapeite ja tilapäinen sääkatto. Telineen koko, osat ja hinta lasketaan antamistasi talon tiedoista; näet ne tilaussivulla ja 3D-mallissa ennen tilausta.",
        en: "Rental of scaffolding with delivery, installation, inspection before first use and dismantling, for a house or other building, with weather sheeting and a temporary roof as options. The scaffold's size, parts and price are calculated from the house details you give; you see them on the order page and in the 3D view before ordering."
      }
    ]
  },
  {
    id: "price",
    title: { fi: "Hinta ja maksaminen", en: "Price and payment" },
    body: [
      {
        fi: "Kokonaishinta arvonlisäveroineen näytetään ennen tilausta, ja se sisältää vuokran valitulle ajalle, kuljetuksen, asennuksen, tarkastuksen ja purun. Muita pakollisia maksuja ei ole. Vuokra-ajan jatkaminen, lisätyöt ja kadonneet tai vaurioituneet osat veloitetaan erikseen sopimusehtojen mukaan.",
        en: "The total price including VAT is shown before you order, and it includes rent for the chosen period, delivery, installation, inspection and dismantling. There are no other mandatory charges. Extending the rental, extra work and lost or damaged parts are charged separately under the terms of service."
      },
      {
        fi: "Toimisto tarkistaa hinnan ennen vahvistusta. Jos hinta muuttuu, lähetämme uuden hinnan hyväksyttäväksi; ilman hyväksyntääsi tilaus ei sido sinua. Maksu laskulla, maksuaika [14] päivää.",
        en: "The office checks the price before confirming. If it changes, we send you the new price to accept; without your acceptance the order doesn't bind you. Payment by invoice, due in [14] days."
      }
    ]
  },
  {
    id: "delivery",
    title: { fi: "Toimitus, kesto ja päättyminen", en: "Delivery, duration and ending" },
    body: [
      {
        fi: "Sopimus syntyy, kun toimisto vahvistaa tilauksen. Asennus tehdään tilausvahvistuksen päivänä, jos sää sallii. Sopimus on voimassa sovitun vuokra-ajan (vähintään [7] päivää) ja päättyy, kun teline on purettu ja noudettu. Vuokra-aikaa voi muuttaa seurantasivulla toimiston vahvistuksella.",
        en: "The contract is made when the office confirms the order. Installation happens on the confirmed date if the weather allows. The contract lasts for the agreed rental period (at least [7] days) and ends when the scaffold has been dismantled and collected. You can change the rental period on the tracking page, confirmed by the office."
      }
    ]
  },
  {
    id: "withdrawal",
    title: { fi: "Peruuttamisoikeus", en: "Right of withdrawal" },
    body: [
      {
        fi: "Sinulla on oikeus peruuttaa sopimus 14 päivän kuluessa ilmoittamatta syytä. Peruuttamisaika päättyy 14 päivän kuluttua sopimuksen tekopäivästä eli päivästä, jona toimisto vahvisti tilauksen.",
        en: "You have the right to withdraw from the contract within 14 days without giving any reason. The withdrawal period ends 14 days after the day the contract was made, i.e. the day the office confirmed your order."
      },
      {
        fi: "Peruuttamisoikeuden käyttämiseksi ilmoita meille päätöksestäsi yksiselitteisellä tavalla, esimerkiksi sähköpostilla, kirjeellä, seurantasivun viestillä tai puhelimitse. Voit käyttää alla olevaa peruuttamislomaketta, mutta se ei ole pakollista. Riittää, että lähetät ilmoituksen ennen peruuttamisajan päättymistä.",
        en: "To withdraw, tell us your decision in a clear statement, for example by email, letter, a message on the tracking page or by phone. You can use the model withdrawal form below, but you don't have to. It is enough to send your notice before the withdrawal period ends."
      },
      {
        fi: "Jos peruutat sopimuksen, palautamme kaikki sinulta saamamme maksut viivytyksettä ja viimeistään 14 päivän kuluttua siitä, kun saimme peruuttamisilmoituksesi. Palautus tehdään samalla maksutavalla, jota käytit, ellei toisin sovita, eikä siitä aiheudu sinulle kuluja.",
        en: "If you withdraw, we refund all payments received from you without undue delay and no later than 14 days after we receive your notice. We use the same means of payment you used unless we agree otherwise, and you will not be charged for the refund."
      }
    ]
  },
  {
    id: "early-start",
    title: { fi: "Työn aloittaminen peruuttamisaikana", en: "Work starting within the withdrawal period" },
    body: [
      {
        fi: "Jos haluat telineen pystyyn ennen kuin peruuttamisaika on päättynyt, sinun on pyydettävä sitä nimenomaisesti. Verkkosivuilla teet sen tilauksen viimeisessä vaiheessa olevalla valintaruudulla, joka näytetään, kun aloituspäivä on 14 päivän sisällä. Ilman pyyntöäsi emme aloita työtä ennen peruuttamisajan päättymistä.",
        en: "If you want the scaffold up before the withdrawal period ends, you must ask for it explicitly. On the website you do this with the checkbox in the last step of the order, shown when the start date is within 14 days. Without your request we don't start before the withdrawal period ends."
      },
      {
        fi: "Jos pyydät aloittamista peruuttamisaikana ja peruutat sopimuksen sen jälkeen, sinun on maksettava kohtuullinen korvaus siihen asti suoritetusta palvelusta (esim. kuljetus, asennus ja kuluneet vuokrapäivät) suhteessa sopimuksen kokonaishintaan. Teline puretaan ja noudetaan, ja purku veloitetaan [kokonaishinnan purkuosuuden mukaan].",
        en: "If you ask us to start within the withdrawal period and then withdraw, you must pay a reasonable amount for the service provided until then (for example delivery, installation and the rental days used), in proportion to the total price. The scaffold is dismantled and collected, and dismantling is charged [at the dismantling share of the total price]."
      }
    ]
  },
  {
    id: "lost",
    title: { fi: "Peruuttamisoikeuden menettäminen", en: "When the right of withdrawal is lost" },
    body: [
      {
        fi: "Menetät peruuttamisoikeuden, jos palvelu on kokonaan suoritettu peruuttamisaikana sen jälkeen, kun olet nimenomaisesti pyytänyt aloittamista ja hyväksynyt, että menetät peruuttamisoikeuden, kun palvelu on kokonaan suoritettu. Telinevuokrassa tämä on harvinaista, koska palvelu päättyy vasta purkuun.",
        en: "You lose the right of withdrawal if the service has been fully performed within the withdrawal period after you explicitly asked us to start and accepted that you lose the right once the service is fully performed. With a scaffold rental this is rare, because the service only ends at dismantling."
      }
    ]
  },
  {
    id: "defects",
    title: { fi: "Virhevastuu ja reklamaatiot", en: "Liability for defects and complaints" },
    body: [
      {
        fi: "Palveluun sovelletaan lakisääteistä virhevastuuta. Ilmoita virheestä kohtuullisessa ajassa sen havaitsemisesta; turvallisuusviasta soita heti. Yhteystiedot ovat tämän sivun alussa. Erillistä takuuta tai asiakaspalvelun jälkeisiä palveluita ei ole, ellei toisin sovita.",
        en: "The service is covered by the statutory liability for defects. Tell us about a defect within a reasonable time of noticing it; for a safety problem, call straight away. The contact details are at the top of this page. There is no separate guarantee or after-sales service unless agreed."
      }
    ]
  },
  {
    id: "disputes",
    title: { fi: "Riitojen ratkaisu", en: "Settling disputes" },
    body: [
      {
        fi: "Jos emme pääse sopuun, voit kääntyä kuluttajaneuvonnan puoleen (kuluttajaneuvonta.fi) ja viedä asian kuluttajariitalautakuntaan (Kuluttajariitalautakunta, PL 306, 00531 Helsinki, kuluttajariita.fi). Asian käsittely lautakunnassa on maksutonta.",
        en: "If we can't agree, you can contact the consumer advisory service (kuluttajaneuvonta.fi) and take the matter to the Consumer Disputes Board (Kuluttajariitalautakunta, PO Box 306, 00531 Helsinki, kuluttajariita.fi). The Board's handling is free of charge."
      }
    ]
  }
];

/** Model withdrawal form (Consumer Protection Act ch. 6 appendix / Government Decree 1086/2013 model, adapted). */
export const WITHDRAWAL_FORM = {
  title: { fi: "Peruuttamislomake", en: "Model withdrawal form" },
  intro: {
    fi: "Täytä ja palauta tämä lomake vain, jos haluat peruuttaa sopimuksen. Voit kopioida tekstin sähköpostiin.",
    en: "Complete and return this form only if you wish to withdraw from the contract. You can copy the text into an email."
  },
  lines: [
    { fi: "Vastaanottaja: {company}, {address}, {email}", en: "To: {company}, {address}, {email}" },
    { fi: "Ilmoitan/ilmoitamme, että peruutan/peruutamme tekemäni/tekemämme sopimuksen, joka koskee seuraavan palvelun tilaamista: telineiden vuokra ja asennus", en: "I/We hereby give notice that I/We withdraw from my/our contract for the provision of the following service: scaffolding rental and installation" },
    { fi: "Tilattu (pvm) / tilausnumero (TK-…):", en: "Ordered on (date) / order reference (TK-…):" },
    { fi: "Kuluttajan nimi / kuluttajien nimet:", en: "Name of consumer(s):" },
    { fi: "Kuluttajan osoite / kuluttajien osoitteet:", en: "Address of consumer(s):" },
    { fi: "Kuluttajan allekirjoitus / kuluttajien allekirjoitukset (vain jos lomake tehdään paperilla):", en: "Signature of consumer(s) (only if this form is notified on paper):" },
    { fi: "Päiväys:", en: "Date:" }
  ]
};
