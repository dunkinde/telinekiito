// City landing pages (/telineet/<slug> in Finnish, /en/scaffolding/<slug> in English). Each city has its own copy so the
// pages aren't thin duplicates: write about what is local (house stock, weather, permits, distances), not generic text.
// The pages are rendered on the server, so their UI strings live here too (i18n.tsx is a client module).
// The delivery zone must match lib/suggest.js: A = Helsinki, Espoo, Vantaa, Kauniainen; B = rest of Uusimaa; C = elsewhere.
import type { Zone } from "./api";
import type { Faq, L } from "./content";

export interface City {
  slug: string;
  name: L;
  /** Swedish name where the town is bilingual or has a historic Swedish name. */
  sv?: string;
  /** Finnish "in" and "to" forms: Haminassa, Haminaan. */
  inFi: string;
  toFi: string;
  region: L;
  zone: Zone;
  /** Road distance from Helsinki, km (rounded; 0 = Helsinki itself). */
  km: number;
  lat: number;
  lon: number;
  title: L;
  description: L;
  h1: L;
  /** Opening paragraph (hero) and the longer local section. */
  lead: L;
  local: L[];
  /** One local thing to know before ordering. */
  tip: { title: L; text: L };
  areas: string[];
  faq: Faq[];
}

export const CITIES: City[] = [
  {
    slug: "hamina",
    name: { fi: "Hamina", en: "Hamina" },
    sv: "Fredrikshamn",
    inFi: "Haminassa",
    toFi: "Haminaan",
    region: { fi: "Kymenlaakso", en: "Kymenlaakso" },
    zone: "C",
    km: 145,
    lat: 60.5697,
    lon: 27.1979,
    title: { fi: "Telineet Haminaan – vuokra, asennus ja hinta | TelineKiito", en: "Scaffolding in Hamina – rental, installation and price | TelineKiito" },
    description: {
      fi: "Rakennustelineet Haminaan toimitettuna, asennettuna ja purettuna. Kirjoita osoite ja näe koko hinta kuljetuksineen noin minuutissa – ympyräkaupungista Vehkalahdelle.",
      en: "Scaffolding delivered, installed and dismantled in Hamina. Type your address and see the full price with transport in about a minute – from the old town to Vehkalahti."
    },
    h1: { fi: "Rakennustelineet Haminaan", en: "Scaffolding for homes in Hamina" },
    lead: {
      fi: "Kattoremontti Saviniemessä tai julkisivun maalaus ympyräkaupungin puutalossa? Laske telineiden hinta osoitteellasi – toimitus, asennus, tarkastus ja purku sisältyvät.",
      en: "Re-roofing in Saviniemi or painting a wooden house in the round old town? Price the scaffolding with your address – delivery, installation, inspection and dismantling included."
    },
    local: [
      {
        fi: "Haminan pientalot ovat usein 1950–70-lukujen puu- ja tiilitaloja, joissa katto ja ulkovuoraus uusitaan samaan aikaan. Silloin kannattaa valita teline sekä katolle että julkisivulle: yksi toimitus ja yksi kuljetus riittävät koko remonttiin.",
        en: "Many detached houses in Hamina are wooden or brick homes from the 1950s–70s, where the roof and the cladding get renewed together. Then it pays to choose scaffolding for both roof and facade: one delivery and one transport cover the whole renovation."
      },
      {
        fi: "Hamina on toimitusalueen itäreunalla, noin 145 km pääkaupunkiseudulta, joten kuljetus on suurin yksittäinen ero Helsingin hintaan. Pidempi vuokra-aika ei lisää kuljetuksia – telineet tuodaan ja haetaan kerran.",
        en: "Hamina is at the eastern edge of our delivery area, about 145 km from the Helsinki region, so transport is the biggest single difference from a Helsinki price. A longer rental adds no extra trips – the scaffold is delivered and collected once."
      }
    ],
    tip: {
      title: { fi: "Rannikon tuuli", en: "Coastal wind" },
      text: {
        fi: "Merituuli voi olla Haminan niemillä kova. Jos valitset sääsuojan, teline ankkuroidaan jokaiselta tasolta – laskuri lisää ankkurit hintaan automaattisesti.",
        en: "Sea wind can be strong on Hamina's headlands. If you choose weather sheeting, the scaffold is anchored on every level – the calculator adds the anchors to the price automatically."
      }
    },
    areas: ["Keskusta ja ympyräkaupunki", "Saviniemi", "Husula", "Vilniemi", "Summa", "Neuvoton", "Vehkalahti"],
    faq: [
      {
        q: { fi: "Toimitatteko koko Haminan alueelle?", en: "Do you deliver all over Hamina?" },
        a: {
          fi: "Kyllä, keskustasta Vehkalahdelle ja saariin, joihin pääsee kuorma-autolla. Hamina kuuluu toimitusalueeseen C, ja normaali toimitus on kolmessa arkipäivässä.",
          en: "Yes, from the centre to Vehkalahti and to islands reachable by truck. Hamina is in delivery zone C, and standard delivery is three working days."
        }
      },
      {
        q: { fi: "Tarvitaanko vanhassa kaupungissa lupa telineelle?", en: "Do I need a permit for scaffolding in the old town?" },
        a: {
          fi: "Omalla tontilla teline ei yleensä tarvitse lupaa. Jos teline seisoo kadulla tai jalkakäytävällä, katualueen käyttöön haetaan lupa Haminan kaupungilta. Suojellun talon julkisivun muutokset voivat vaatia oman lupansa – itse teline ei.",
          en: "On your own plot a scaffold usually needs no permit. If it stands on the street or pavement, you apply to the City of Hamina for use of the street area. Changes to a protected building's facade may need their own permit – the scaffold itself doesn't."
        }
      }
    ]
  },
  {
    slug: "kotka",
    name: { fi: "Kotka", en: "Kotka" },
    inFi: "Kotkassa",
    toFi: "Kotkaan",
    region: { fi: "Kymenlaakso", en: "Kymenlaakso" },
    zone: "C",
    km: 130,
    lat: 60.4664,
    lon: 26.9458,
    title: { fi: "Rakennustelineet Kotka – hinta osoitteella | TelineKiito", en: "Scaffolding in Kotka – instant price for your address | TelineKiito" },
    description: {
      fi: "Telineet Kotkaan Kotkansaarelta Karhulaan ja Mussaloon. Laske hinta osoitteellasi: vuokra, kuljetus, asennus ja purku samassa summassa. Sääsuoja merituulta vastaan.",
      en: "Scaffolding in Kotka, from Kotkansaari to Karhula and Mussalo. Price it with your address: rent, transport, installation and dismantling in one total. Sheeting against the sea wind."
    },
    h1: { fi: "Telineet Kotkaan – katolle ja julkisivulle", en: "Scaffolding in Kotka – for roofs and facades" },
    lead: {
      fi: "Kotkassa meri on lähellä melkein joka talossa. Saat telineen kattoremonttiin, peltikaton uusimiseen tai julkisivun maalaukseen – hinta näkyy heti, kun kirjoitat osoitteen.",
      en: "In Kotka the sea is close to almost every house. Get scaffolding for re-roofing, a new metal roof or facade painting – the price shows as soon as you type the address."
    },
    local: [
      {
        fi: "Suolainen merituuli kuluttaa peltikattoja ja maalipintoja nopeammin kuin sisämaassa, joten Kotkassa katto- ja maalausremontit tulevat vastaan tiheämmin. Räystästeline ja räystässuoja riittävät kattotyöhön; julkisivussa jokainen taso lankutetaan.",
        en: "Salty sea wind wears metal roofs and paint faster than inland, so roof and paint jobs come round more often in Kotka. Eaves scaffolding with a roof-catch guard is enough for roof work; for facades every level is decked."
      },
      {
        fi: "Karhulan ja Langinkosken omakotialueilla tontit ovat yleensä väljiä, mutta Kotkansaaren keskustassa talo voi olla kiinni jalkakäytävässä. Kerro tilauksessa, jos teline tulee yleiselle alueelle, niin otamme sen huomioon aikataulussa.",
        en: "In Karhula and Langinkoski plots are usually roomy, but in central Kotkansaari a house can stand right on the pavement. Tell us in the order if the scaffold goes onto a public area, and we'll allow for it in the schedule."
      }
    ],
    tip: {
      title: { fi: "Myrskyjen jälkeen", en: "After a storm" },
      text: {
        fi: "Syysmyrskyn jälkeen kiireelliset kohteet kannattaa tilata heti: laskuri näyttää aikaisimman vapaan aloituspäivän suoraan varastotilanteesta.",
        en: "After an autumn storm, order urgent jobs straight away: the calculator shows the first free start date straight from our stock."
      }
    },
    areas: ["Kotkansaari", "Karhula", "Langinkoski", "Mussalo", "Hovinsaari", "Sunila", "Jumalniemi"],
    faq: [
      {
        q: { fi: "Paljonko kuljetus Kotkaan maksaa?", en: "How much is transport to Kotka?" },
        a: {
          fi: "Kotka kuuluu toimitusalueeseen C. Kuljetuksen hinta suuntaansa näkyy tällä sivulla ja laskurissa; isommat telineet voivat vaatia kaksi kuormaa, jolloin laskuri lisää toisen kuljetuksen.",
          en: "Kotka is in delivery zone C. The one-way transport price is shown on this page and in the calculator; bigger scaffolds may need two loads, and the calculator then adds the second trip."
        }
      },
      {
        q: { fi: "Saako telineeseen sääsuojan?", en: "Can I get weather sheeting on the scaffold?" },
        a: {
          fi: "Kyllä. Julkisivutelineeseen saa suojapeitteen ja kattotyöhön väliaikaisen sääkaton. Molempien hinta lasketaan talosi mitoista samassa laskurissa.",
          en: "Yes. Facade scaffolding can get sheeting and roof work a temporary weather roof. Both are priced from your house's measurements in the same calculator."
        }
      }
    ]
  },
  {
    slug: "kouvola",
    name: { fi: "Kouvola", en: "Kouvola" },
    inFi: "Kouvolassa",
    toFi: "Kouvolaan",
    region: { fi: "Kymenlaakso", en: "Kymenlaakso" },
    zone: "C",
    km: 135,
    lat: 60.8679,
    lon: 26.7042,
    title: { fi: "Telinevuokraus Kouvola – asennus ja purku | TelineKiito", en: "Scaffolding rental in Kouvola – installed and removed | TelineKiito" },
    description: {
      fi: "Telinevuokraus Kouvolaan asennettuna: Kuusankoski, Valkeala, Elimäki ja Anjalankoski. Hinta osoitteella minuutissa, ja kotitalousvähennykseen kelpaava työn osuus näkyy erikseen.",
      en: "Scaffolding rental in Kouvola, installed for you: Kuusankoski, Valkeala, Elimäki and Anjalankoski. Price by address in a minute, with the labour share for the tax credit shown separately."
    },
    h1: { fi: "Telinevuokraus Kouvolassa – asennettuna", en: "Scaffolding rental in Kouvola, installed" },
    lead: {
      fi: "Kouvola on laaja kaupunki, ja rintamamiestaloja on joka kylässä. Kirjoita osoitteesi, niin laskemme talosi mitoista telineen hinnan Kuusankoskelta Jaalaan.",
      en: "Kouvola is a large town with post-war family houses in every village. Type your address and we price the scaffolding from your house's measurements, from Kuusankoski to Jaala."
    },
    local: [
      {
        fi: "Puolitoistakerroksinen rintamamiestalo jyrkällä harjakatolla on Kouvolan seudulla tavallinen telinekohde. Päätyihin tulee reunasuojaus lähes harjalle asti, ja räystäille räystässuoja – laskuri huomioi katon kaltevuuden ja kerroskorkeuden.",
        en: "A storey-and-a-half post-war house with a steep gable roof is a typical scaffolding job around Kouvola. The gables get edge protection almost to the ridge and the eaves a roof-catch guard – the calculator allows for roof pitch and storey height."
      },
      {
        fi: "Kouvola on sisämaassa, jossa lunta tulee enemmän kuin rannikolla. Kattoremontti kannattaa ajoittaa keväästä syksyyn; talvella sääkatto pitää työmaan kuivana, jos remontti ei voi odottaa.",
        en: "Kouvola is inland, where more snow falls than on the coast. Plan re-roofing between spring and autumn; in winter a temporary weather roof keeps the site dry if the job can't wait."
      }
    ],
    tip: {
      title: { fi: "Pitkät välimatkat", en: "Long distances" },
      text: {
        fi: "Kaupungin sisällä välimatkat ovat pitkiä, mutta kuljetuksen hinta on sama koko Kouvolassa: se määräytyy toimitusalueen mukaan.",
        en: "Distances within the town are long, but the transport price is the same everywhere in Kouvola: it's set by the delivery zone."
      }
    },
    areas: ["Keskusta", "Kuusankoski", "Valkeala", "Elimäki", "Anjalankoski", "Inkeroinen", "Koria", "Jaala"],
    faq: [
      {
        q: { fi: "Kuinka pian telineet saadaan Kouvolaan?", en: "How soon can you deliver to Kouvola?" },
        a: {
          fi: "Normaali toimitus on kolmessa arkipäivässä. Laskuri näyttää aikaisimman vapaan aloituspäivän, ja nopeammat toimitukset, jos ne ovat tarjolla.",
          en: "Standard delivery is three working days. The calculator shows the first free start date, and faster options when they're available."
        }
      },
      {
        q: { fi: "Riittääkö räystästeline peltikaton vaihtoon?", en: "Is eaves scaffolding enough to replace a metal roof?" },
        a: {
          fi: "Useimmiten kyllä: räystäiden puolelle tulee työtaso ja räystässuoja, päätyihin reunasuojaus. Jos myös otsalaudat ja ulkovuoraus uusitaan, valitse katto ja julkisivu.",
          en: "Usually yes: the gutter sides get a working level and a roof-catch guard, the gables edge protection. If the fascia and cladding are renewed too, choose roof and facade."
        }
      }
    ]
  },
  {
    slug: "porvoo",
    name: { fi: "Porvoo", en: "Porvoo" },
    sv: "Borgå",
    inFi: "Porvoossa",
    toFi: "Porvooseen",
    region: { fi: "Itä-Uusimaa", en: "Eastern Uusimaa" },
    zone: "B",
    km: 50,
    lat: 60.3932,
    lon: 25.6649,
    title: { fi: "Rakennustelineet Porvoo – pikatoimitus 48 h | TelineKiito", en: "Scaffolding in Porvoo – express delivery in 48 h | TelineKiito" },
    description: {
      fi: "Telineet Porvooseen ja Borgåhon: Hamari, Kevätkumpu, Peipohja ja Pellinki. Pikatoimitus 48 tunnissa, hinta osoitteella noin minuutissa – asennus ja purku mukana.",
      en: "Scaffolding in Porvoo (Borgå): Hamari, Kevätkumpu, Gammelbacka and Pellinge. Express delivery in 48 hours, price by address in about a minute – installation and dismantling included."
    },
    h1: { fi: "Rakennustelineet Porvooseen", en: "Scaffolding in Porvoo – Borgå" },
    lead: {
      fi: "Porvoo on vain noin 50 km pääkaupunkiseudulta, joten telineet ehtivät paikalle pikatoimituksena 48 tunnissa. Laske hinta omakotitalollesi tai taloyhtiön rivitalolle.",
      en: "Porvoo is only about 50 km from the Helsinki region, so scaffolding can arrive as an express delivery within 48 hours. Price it for your house or your housing company's row house."
    },
    local: [
      {
        fi: "Vanhan Porvoon puutalot ja rantamakasiinit maalataan perinteisillä maaleilla, ja työ etenee hitaammin kuin uudessa talossa. Vuokra-aikaa voi jatkaa viikko kerrallaan seurantasivulla, joten aikataulua ei tarvitse arvata etukäteen.",
        en: "The wooden houses and riverside storehouses of Old Porvoo are painted with traditional paints, and the work goes slower than on a new house. You can extend the rental a week at a time on the tracking page, so there's no need to guess the schedule upfront."
      },
      {
        fi: "Hamarin, Kevätkummun ja Peipohjan omakotialueilla tyypillinen kohde on 1980–2000-luvun talo, jonka katto tai julkisivu kaipaa ensimmäistä isoa remonttiaan. Teline tuodaan, asennetaan ja tarkastetaan yhden päivän aikana.",
        en: "In Hamari, Kevätkumpu and Gammelbacka the typical job is a house from the 1980s–2000s getting its first big roof or facade renovation. The scaffold is delivered, installed and inspected in one day."
      }
    ],
    tip: {
      title: { fi: "Kapeat kujat", en: "Narrow lanes" },
      text: {
        fi: "Vanhassa Porvoossa kuorma-auto ei aina pääse talon viereen. Kerro tilauksen lisätiedoissa, jos ajoyhteys on ahdas – osat voidaan kantaa lyhyen matkan.",
        en: "In Old Porvoo the truck can't always reach the house. Mention it in the order notes if access is tight – parts can be carried a short way."
      }
    },
    areas: ["Keskusta ja Vanha Porvoo", "Hamari", "Kevätkumpu", "Peipohja (Gammelbacka)", "Kerkkoo", "Tolkkinen", "Pellinki"],
    faq: [
      {
        q: { fi: "Kuuluuko Porvoo pikatoimituksen alueelle?", en: "Is Porvoo covered by express delivery?" },
        a: {
          fi: "Kyllä. Porvoo on toimitusalueella B (muu Uusimaa), noin 50 km päässä, ja pikatoimitus 48 tunnissa on mahdollinen. Lisämaksu koskee vain palveluosuutta.",
          en: "Yes. Porvoo is in delivery zone B (rest of Uusimaa), about 50 km away, and express delivery within 48 hours is possible. The surcharge applies only to the service part."
        }
      },
      {
        q: { fi: "Voiko vuokra-aikaa jatkaa, jos maalaus venyy?", en: "Can I extend the rental if the painting takes longer?" },
        a: {
          fi: "Kyllä. Jatka vuokraa viikko kerrallaan seurantasivulla tilausviitteelläsi – teline jää paikalleen, eikä uutta kuljetusta tarvita.",
          en: "Yes. Extend the rental a week at a time on the tracking page with your order reference – the scaffold stays put and no new transport is needed."
        }
      }
    ]
  },
  {
    slug: "helsinki",
    name: { fi: "Helsinki", en: "Helsinki" },
    sv: "Helsingfors",
    inFi: "Helsingissä",
    toFi: "Helsinkiin",
    region: { fi: "Uusimaa", en: "Uusimaa" },
    zone: "A",
    km: 0,
    lat: 60.1699,
    lon: 24.9384,
    title: { fi: "Rakennustelineet Helsinki – kiirepystytys 24 h | TelineKiito", en: "Scaffolding in Helsinki – emergency setup in 24 h | TelineKiito" },
    description: {
      fi: "Rakennustelineet Helsingin omakoti- ja rivitaloihin Pakilasta Laajasaloon. Kiirepystytys 24 tunnissa myrskyvaurioon, hinta osoitteella minuutissa ja seuranta verkossa.",
      en: "Scaffolding for Helsinki homes and row houses, from Pakila to Laajasalo. Emergency setup within 24 hours for storm damage, price by address in a minute, and online tracking."
    },
    h1: { fi: "Rakennustelineet Helsingissä – pystyssä 24 tunnissa", en: "Scaffolding in Helsinki – up within 24 hours" },
    lead: {
      fi: "Helsinki on lähin toimitusalueemme. Myrskyvaurioon tai vuotavaan kattoon saat kiirepystytyksen 24 tunnissa, ja normaalin kohteen hinta näkyy osoitteella heti.",
      en: "Helsinki is our nearest delivery zone. For storm damage or a leaking roof you get an emergency setup within 24 hours, and a normal job is priced from your address straight away."
    },
    local: [
      {
        fi: "Helsingin pientaloalueilla – Pakilassa, Paloheinässä, Tapaninkylässä ja Marjaniemessä – tontit ovat usein pieniä ja naapuri lähellä. Teline mitoitetaan talon sivujen mukaan, ja leveys pysyy 0,73 metrissä, joten se mahtuu kapeallekin sivulle.",
        en: "In Helsinki's house districts – Pakila, Paloheinä, Tapaninkylä and Marjaniemi – plots are often small and the neighbour close. The scaffold follows each side of the house and is only 0.73 m wide, so it fits even a narrow side."
      },
      {
        fi: "Kantakaupungin ja Kulosaaren vanhoissa huviloissa ja kerrostalojen pihasiivissä teline joutuu usein jalkakäytävälle. Silloin katualueen käyttöön tarvitaan kaupungin lupa – kerromme tilauksen tarkistuksessa, koskeeko se sinua.",
        en: "With old villas in the inner city and Kulosaari, and courtyard wings of apartment blocks, the scaffold often ends up on the pavement. Then the city's permit for using the street area is needed – we tell you when we check your order whether it applies."
      }
    ],
    tip: {
      title: { fi: "Kiirepystytys", en: "Emergency setup" },
      text: {
        fi: "Kiirepystytys 24 tunnissa on tarjolla pääkaupunkiseudulla. Valitse laskurissa toimitusnopeus, niin näet lisämaksun ennen tilausta.",
        en: "Emergency setup within 24 hours is available in the Helsinki region. Pick the delivery speed in the calculator to see the surcharge before you order."
      }
    },
    areas: ["Pakila", "Paloheinä", "Tapaninkylä", "Puistola", "Laajasalo", "Marjaniemi", "Kulosaari", "Munkkiniemi"],
    faq: [
      {
        q: { fi: "Tarvitaanko Helsingissä lupa, jos teline on jalkakäytävällä?", en: "Do I need a permit in Helsinki if the scaffold stands on the pavement?" },
        a: {
          fi: "Kyllä. Katualueen tilapäiseen käyttöön haetaan lupa Helsingin kaupungilta ennen pystytystä. Omalla tontilla lupaa ei yleensä tarvita.",
          en: "Yes. Temporary use of the street area needs a permit from the City of Helsinki before installation. On your own plot no permit is usually needed."
        }
      },
      {
        q: { fi: "Ehdittekö paikalle saman viikon aikana?", en: "Can you be on site the same week?" },
        a: {
          fi: "Useimmiten kyllä. Normaali toimitus on kolmessa arkipäivässä, pikatoimitus 48 tunnissa ja kiirepystytys 24 tunnissa. Laskuri näyttää aikaisimman vapaan päivän.",
          en: "Usually yes. Standard delivery is three working days, express 48 hours and emergency 24 hours. The calculator shows the first free date."
        }
      }
    ]
  },
  {
    slug: "espoo",
    name: { fi: "Espoo", en: "Espoo" },
    sv: "Esbo",
    inFi: "Espoossa",
    toFi: "Espooseen",
    region: { fi: "Uusimaa", en: "Uusimaa" },
    zone: "A",
    km: 20,
    lat: 60.2055,
    lon: 24.6559,
    title: { fi: "Telineet Espoo – omakoti- ja rivitaloihin | TelineKiito", en: "Scaffolding in Espoo – for houses and row houses | TelineKiito" },
    description: {
      fi: "Telineet Espoon omakoti- ja rivitaloihin: Tapiola, Haukilahti, Matinkylä, Leppävaara ja Kauklahti. Taloyhtiöille laskutus, kotitalouksille hinta osoitteella minuutissa.",
      en: "Scaffolding for Espoo houses and row houses: Tapiola, Haukilahti, Matinkylä, Leppävaara and Kauklahti. Invoicing for housing companies, a price by address in a minute for homeowners."
    },
    h1: { fi: "Telineet Espoon omakoti- ja rivitaloihin", en: "Scaffolding for Espoo houses and row houses" },
    lead: {
      fi: "Espoossa on paljon 1960–80-lukujen rivitaloja ja omakotitaloja, joiden katot ja julkisivut ovat nyt remonttiiässä. Laske telineen hinta yhdelle talolle tai koko taloyhtiölle.",
      en: "Espoo has many row houses and detached homes from the 1960s–80s whose roofs and facades are now due for renovation. Price the scaffolding for one house or a whole housing company."
    },
    local: [
      {
        fi: "Rivitaloyhtiön kattoremontissa teline siirtyy usein talolta toiselle. Isännöitsijä tai hallitus voi tilata telineet yrityksenä: saatte laskun, viitteet ja seurannan kaikille kohteille samaan paikkaan.",
        en: "In a row-house company's roof renovation the scaffold often moves from one building to the next. The property manager or board can order as a business: you get the invoice, references and tracking for every site in one place."
      },
      {
        fi: "Westendin ja Haukilahden isoissa taloissa räystäät ovat korkealla ja katot monimuotoisia. Kun osoite löytyy Maanmittauslaitoksen 3D-mallista, hinta lasketaan talon todellisista seinistä ja räystäskorkeuksista.",
        en: "Large houses in Westend and Haukilahti have high eaves and complex roofs. When the address is in the National Land Survey's 3D model, the price is calculated from the house's real walls and eave heights."
      }
    ],
    tip: {
      title: { fi: "Taloyhtiöt", en: "Housing companies" },
      text: {
        fi: "Taloyhtiöt, isännöitsijät ja kattourakoitsijat saavat kumppanihinnat ja oman yritysportaalin. Kysy yhteydenottolomakkeella.",
        en: "Housing companies, property managers and roofing contractors get partner prices and their own business portal. Ask through the contact form."
      }
    },
    areas: ["Tapiola", "Westend", "Haukilahti", "Matinkylä", "Leppävaara", "Espoon keskus", "Kauklahti", "Kauniainen"],
    faq: [
      {
        q: { fi: "Voiko taloyhtiö tilata telineet laskulla?", en: "Can a housing company order on invoice?" },
        a: {
          fi: "Kyllä. Yritysasiakkaana saatte laskun, tilausviitteet ja yritysportaalin, jossa näette kaikkien kohteiden tilanteen.",
          en: "Yes. As a business customer you get an invoice, order references and a business portal showing the status of every site."
        }
      },
      {
        q: { fi: "Kuuluuko Kauniainen samaan hintaan?", en: "Is Kauniainen priced the same?" },
        a: {
          fi: "Kyllä. Espoo, Kauniainen, Helsinki ja Vantaa ovat kaikki toimitusalueella A, jossa kuljetus on edullisin ja kiirepystytys 24 tunnissa on tarjolla.",
          en: "Yes. Espoo, Kauniainen, Helsinki and Vantaa are all in delivery zone A, where transport is cheapest and emergency setup within 24 hours is available."
        }
      }
    ]
  },
  {
    slug: "vantaa",
    name: { fi: "Vantaa", en: "Vantaa" },
    sv: "Vanda",
    inFi: "Vantaalla",
    toFi: "Vantaalle",
    region: { fi: "Uusimaa", en: "Uusimaa" },
    zone: "A",
    km: 18,
    lat: 60.2934,
    lon: 25.0378,
    title: { fi: "Rakennustelineet Vantaa – hinta minuutissa | TelineKiito", en: "Scaffolding in Vantaa – priced in a minute | TelineKiito" },
    description: {
      fi: "Rakennustelineet Vantaalle: Tikkurila, Korso, Hakunila, Myyrmäki ja Martinlaakso. Kirjoita osoite, valitse työ ja aloituspäivä – hinta sisältää kuljetuksen, asennuksen ja purun.",
      en: "Scaffolding in Vantaa: Tikkurila, Korso, Hakunila, Myyrmäki and Martinlaakso. Type the address, choose the job and start date – the price includes transport, installation and dismantling."
    },
    h1: { fi: "Rakennustelineet Vantaalle – hinta osoitteella", en: "Scaffolding in Vantaa – priced by address" },
    lead: {
      fi: "Vantaan pientaloalueilla Korsosta Myyrmäkeen telineet tuodaan nopeasti: kaupunki on toimitusalueella A, jossa kuljetus on edullisin.",
      en: "In Vantaa's house districts, from Korso to Myyrmäki, scaffolding arrives fast: the city is in delivery zone A, where transport is cheapest."
    },
    local: [
      {
        fi: "Korson, Rekolan ja Koivukylän 1970–80-lukujen tiilitaloissa ja puolitoistakerroksisissa taloissa remontoidaan nyt räystäitä, ränniä ja katteita. Pelkkään ränni- ja otsalautatyöhön riittää kevyt yksitasoinen räystästeline.",
        en: "In the brick and storey-and-a-half houses of Korso, Rekola and Koivukylä from the 1970s–80s, eaves, gutters and roofing are now being renewed. For gutters and fascia alone, a light single-level eaves scaffold is enough."
      },
      {
        fi: "Hakunilan ja Martinlaakson rivitaloissa julkisivun maalaus tehdään usein talo kerrallaan. Teline voidaan tilata vain niille sivuille, joita työ koskee, ja vuokra-aikaa voi jatkaa verkossa.",
        en: "In the row houses of Hakunila and Martinlaakso facades are often painted one building at a time. You can order scaffolding only for the sides the job needs, and extend the rental online."
      }
    ],
    tip: {
      title: { fi: "Rännit ja otsalaudat", en: "Gutters and fascia" },
      text: {
        fi: "Valitse laskurissa työksi \"Rännit ja räystäät\", niin saat kevyimmän ja edullisimman telineen räystäille.",
        en: "Choose \"Gutters and eaves\" as the job in the calculator to get the lightest and cheapest scaffold for the eaves."
      }
    },
    areas: ["Tikkurila", "Korso", "Rekola", "Koivukylä", "Hakunila", "Myyrmäki", "Martinlaakso", "Pähkinärinne"],
    faq: [
      {
        q: { fi: "Mikä teline riittää rännien vaihtoon?", en: "Which scaffold do I need to replace gutters?" },
        a: {
          fi: "Kevyt yksitasoinen teline räystäiden puolelle. Se on nopea asentaa ja edullisin vaihtoehto – valitse laskurissa työ \"Rännit ja räystäät\".",
          en: "A light single-level scaffold on the gutter sides. It's quick to install and the cheapest option – choose the \"Gutters and eaves\" job in the calculator."
        }
      },
      {
        q: { fi: "Voinko lopettaa vuokran aiemmin, jos työ valmistuu?", en: "Can I end the rental early if the work is done?" },
        a: {
          fi: "Kyllä. Pyydä nouto seurantasivulla tilausviitteelläsi. Vuokraa laskutetaan vähintään vähimmäisvuokra-ajalta.",
          en: "Yes. Request pickup on the tracking page with your order reference. Rent is charged for at least the minimum rental period."
        }
      }
    ]
  },
  {
    slug: "loviisa",
    name: { fi: "Loviisa", en: "Loviisa" },
    sv: "Lovisa",
    inFi: "Loviisassa",
    toFi: "Loviisaan",
    region: { fi: "Itä-Uusimaa", en: "Eastern Uusimaa" },
    zone: "B",
    km: 90,
    lat: 60.4566,
    lon: 26.2251,
    title: { fi: "Telineet Loviisaan – vuokra ja asennus | TelineKiito", en: "Scaffolding in Loviisa – rental and installation | TelineKiito" },
    description: {
      fi: "Telineet Loviisaan, Pernajaan, Ruotsinpyhtäälle ja Valkoon. Puutalon maalaus tai mökin katto: hinta osoitteella minuutissa, toimitus ja asennus samassa hinnassa.",
      en: "Scaffolding in Loviisa, Pernå, Ruotsinpyhtää and Valko. Painting a wooden house or a cottage roof: priced by address in a minute, with delivery and installation included."
    },
    h1: { fi: "Telineet Loviisaan puutaloihin ja mökeille", en: "Scaffolding in Loviisa for wooden houses and cottages" },
    lead: {
      fi: "Loviisan puutalokaupunki ja rannikon kesäasunnot tarvitsevat maalia ja kattoa säännöllisesti. Laske telineiden hinta osoitteellasi – myös Pernajaan ja Ruotsinpyhtäälle.",
      en: "Loviisa's wooden old town and the summer houses on the coast need paint and roofing regularly. Price scaffolding with your address – Pernå and Ruotsinpyhtää too."
    },
    local: [
      {
        fi: "Puu-Loviisan empiretalot ovat usein kaksikerroksisia ja julkisivultaan pitkiä. Maalaukseen tulee teline kaikille sivuille, ja jokainen taso lankutetaan, jotta vanhan maalin kaapiminen ja pohjamaalaus onnistuvat turvallisesti.",
        en: "The empire-style houses of wooden Loviisa are often two storeys tall with long facades. Painting needs scaffolding on every side with every level decked, so scraping old paint and priming can be done safely."
      },
      {
        fi: "Saariston ja rannikon mökeille ei aina pääse kuorma-autolla. Kerro tilauksessa, jos kohteeseen on vain kapea tie tai lauttayhteys – tarkistamme toimituksen ennen kuin vahvistamme hinnan.",
        en: "Archipelago and coastal cottages can't always be reached by truck. Tell us in the order if there's only a narrow road or a ferry – we check the delivery before confirming the price."
      }
    ],
    tip: {
      title: { fi: "Kesä täyttyy nopeasti", en: "Summer fills up fast" },
      text: {
        fi: "Mökkien maalauskausi keskittyy kesään. Varaa telineet ajoissa – laskuri näyttää heti, milloin varastossa on vapaata.",
        en: "Cottage painting season is concentrated in summer. Book early – the calculator shows straight away when stock is free."
      }
    },
    areas: ["Keskusta ja Puu-Loviisa", "Valko", "Pernaja (Pernå)", "Ruotsinpyhtää", "Liljendal", "Tesjoki"],
    faq: [
      {
        q: { fi: "Mihin toimitusalueeseen Loviisa kuuluu?", en: "Which delivery zone is Loviisa in?" },
        a: {
          fi: "Toimitusalueeseen B (muu Uusimaa). Loviisa on noin 90 km päässä, joten pikatoimitus 48 tunnissa on mahdollinen.",
          en: "Zone B (rest of Uusimaa). Loviisa is about 90 km away, so express delivery within 48 hours is possible."
        }
      },
      {
        q: { fi: "Toimitatteko saareen tai mökille ilman tieyhteyttä?", en: "Do you deliver to an island or a cottage without road access?" },
        a: {
          fi: "Kuorma-auto tarvitsee ajoyhteyden kohteen lähelle. Saaristokohteista sovitaan erikseen – kirjoita tilaukseen lisätietoihin, miten kohteeseen pääsee.",
          en: "The truck needs road access close to the site. Island sites are agreed separately – describe the access in the order notes."
        }
      }
    ]
  }
];

export const citySlugs = () => CITIES.map((c) => c.slug);
export const cityBySlug = (slug: string) => CITIES.find((c) => c.slug === slug);

/** Delivery promise per zone (the rings in lib/content.ts COVERAGE: 50, 100 and 150 km from Helsinki). */
export const ZONE_SPEED: Record<Zone, L> = {
  A: { fi: "Kiirepystytys 24 tunnissa, pikatoimitus 48 tunnissa", en: "Emergency setup in 24 hours, express in 48 hours" },
  B: { fi: "Pikatoimitus 48 tunnissa, normaali 3 arkipäivässä", en: "Express in 48 hours, standard in 3 working days" },
  C: { fi: "Normaali toimitus 3 arkipäivässä", en: "Standard delivery in 3 working days" }
};

/** Labels for the city pages. */
export const CITY_UI = {
  home: { fi: "Etusivu", en: "Home" },
  quote: { fi: "Laske hinta", en: "Get a price" },
  track: { fi: "Seuraa tilausta", en: "Track order" },
  eyebrow: { fi: "Rakennustelineet · {region}", en: "Scaffolding · {region}" },
  addressPh: { fi: "Katuosoite, {city}", en: "Street address, {city}" },
  trust: [
    { fi: "Toimitus, asennus ja purku", en: "Delivery, installation and dismantling" },
    { fi: "Ei maksua tilatessa", en: "No payment when ordering" },
    { fi: "Tarkastettu ja merkitty teline", en: "Inspected and tagged scaffold" }
  ],
  zoneTitle: { fi: "Toimitusalue {zone}", en: "Delivery zone {zone}" },
  zoneNames: {
    A: { fi: "Helsinki, Espoo, Vantaa, Kauniainen", en: "Helsinki, Espoo, Vantaa, Kauniainen" },
    B: { fi: "Muu Uusimaa", en: "Rest of Uusimaa" },
    C: { fi: "Uudenmaan ulkopuolella, enintään 150 km", en: "Outside Uusimaa, up to 150 km" }
  } as Record<Zone, L>,
  transport: { fi: "Kuljetus suuntaansa (alv 0 %)", en: "Transport, one way (excl. VAT)" },
  transportNote: {
    fi: "Kuljetus veloitetaan tuonnista ja noudosta. Iso teline voi vaatia useamman kuorman – laskuri näyttää tarkan summan.",
    en: "Transport is charged for delivery and pickup. A big scaffold may need more than one load – the calculator shows the exact amount."
  },
  distance: { fi: "Noin {km} km pääkaupunkiseudulta", en: "About {km} km from the Helsinki region" },
  distanceHome: { fi: "Lähin toimitusalueemme", en: "Our nearest delivery zone" },
  localTitle: { fi: "Telineet {to}", en: "Scaffolding in {city}" },
  areasTitle: { fi: "Toimitamme myös näille alueille", en: "We also deliver to" },
  stepsTitle: { fi: "Näin tilaat", en: "How to order" },
  faqTitle: { fi: "Kysymyksiä telineistä {in}", en: "Questions about scaffolding in {city}" },
  othersTitle: { fi: "Muut palvelualueet", en: "Other service areas" },
  ctaTitle: { fi: "Valmis laskemaan hinnan?", en: "Ready to see your price?" },
  ctaText: {
    fi: "Kirjoita osoite – hinta näkyy noin minuutissa, eikä tilaus sido ennen vahvistusta.",
    en: "Type the address – the price shows in about a minute, and nothing is binding until we confirm."
  },
  privacy: { fi: "Tietosuojaseloste", en: "Privacy notice" },
  rights: { fi: "Kaikki oikeudet pidätetään.", en: "All rights reserved." },
  serviceType: { fi: "Rakennustelineiden vuokraus, asennus ja purku", en: "Scaffolding rental, installation and dismantling" }
} as const;

/** Fill {name} placeholders. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] != null ? String(vars[k]) : m));
