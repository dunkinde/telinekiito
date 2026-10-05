// Longer section content in both languages. Edit text here; layout lives in the section components.
import type { JobType, Urgency } from "./api";

export type L = { fi: string; en: string };

export type ServiceIcon = "roof" | "facade" | "both" | "gutters" | "bolt" | "building";
export interface Service {
  icon: ServiceIcon;
  title: L;
  text: L;
  points: L[];
  /** Opens the quote with this job (or delivery speed) preselected; without either, the card links to contact. */
  job?: JobType;
  urgency?: Urgency;
}

export const SERVICES: Service[] = [
  {
    icon: "roof",
    job: "roof",
    title: { fi: "Kattoremontti", en: "Roof renovation" },
    text: {
      fi: "Räystästelineet räystäiden puolille ja räystässuoja, päätyihin reunasuojaus lähes harjalle asti.",
      en: "Eaves scaffolding along the gutter sides with a roof-catch guard, plus edge protection on the gables."
    },
    points: [
      { fi: "Räystässuoja", en: "Roof-catch guard" },
      { fi: "Päätyjen reunasuojaus", en: "Gable edge protection" }
    ]
  },
  {
    icon: "facade",
    job: "facade",
    title: { fi: "Julkisivutyö", en: "Facade work" },
    text: {
      fi: "Kaikki sivut ja jokainen taso lankutettuna – maalaukseen, verhoukseen ja ikkunatöihin.",
      en: "All sides, every level decked – for painting, cladding and window work."
    },
    points: [
      { fi: "Kaikki tasot", en: "Every level decked" },
      { fi: "Kaiteet ja jalkalistat", en: "Guardrails and toe boards" }
    ]
  },
  {
    icon: "both",
    job: "roof_facade",
    title: { fi: "Katto ja julkisivu", en: "Roof and facade" },
    text: {
      fi: "Yksi teline koko remonttiin: koko julkisivu tasoineen ja räystässuoja räystäille.",
      en: "One scaffold for the whole renovation: full facade access and a roof-catch guard on the eaves."
    },
    points: [
      { fi: "Koko talo kerralla", en: "Whole house at once" },
      { fi: "Yksi toimitus", en: "One delivery" }
    ]
  },
  {
    icon: "gutters",
    job: "gutters",
    title: { fi: "Rännit ja räystäät", en: "Gutters and eaves" },
    text: {
      fi: "Kevyt yksitasoinen teline räystäille: rännit, otsalaudat ja kattoturvatuotteet.",
      en: "A light single-level scaffold on the gutter sides for gutters, fascia boards and roof safety products."
    },
    points: [
      { fi: "Yksi työtaso", en: "One working level" },
      { fi: "Nopea asennus", en: "Quick to install" }
    ]
  },
  {
    icon: "bolt",
    urgency: "emergency",
    title: { fi: "Kiireelliset kohteet", en: "Emergency scaffolding" },
    text: {
      fi: "Myrskyvaurio tai vuotava katto? Pikapystytys 48 tunnissa, kiirepystytys 24 tunnissa.",
      en: "Storm damage or a leaking roof? Express setup in 48 hours, emergency setup in 24 hours."
    },
    points: [
      { fi: "24 h kiirepystytys", en: "24 h emergency setup" },
      { fi: "48 h pikatoimitus", en: "48 h express" }
    ]
  },
  {
    icon: "building",
    title: { fi: "Yritykset ja taloyhtiöt", en: "Businesses and housing companies" },
    text: {
      fi: "Rivitalot, liikekiinteistöt ja kattourakoitsijat. Kysy kumppanihintaa ja laskutusta.",
      en: "Row houses, small commercial buildings and roofing contractors. Ask about partner pricing and invoicing."
    },
    points: [
      { fi: "Kumppanihinnat", en: "Partner pricing" },
      { fi: "Laskutus", en: "Invoicing" }
    ]
  }
];

export interface Step {
  title: L;
  text: L;
  meta: L;
}
export const STEPS: Step[] = [
  {
    title: { fi: "Saat hinnan", en: "Get your price" },
    text: {
      fi: "Kirjoita osoitteesi. Luemme rakennuksen ääriviivat avoimesta karttadatasta ja kerrosluvun rakennusrekisteristä – tai lataa piirustus, niin tekoäly lukee mitat.",
      en: "Type your address. We read the building outline from open map data and the floors from the national building register – or upload a drawing and AI reads the measurements."
    },
    meta: { fi: "Noin 60 sekuntia", en: "About 60 seconds" }
  },
  {
    title: { fi: "Tilaa verkossa", en: "Book online" },
    text: {
      fi: "Valitse työ ja aloituspäivä ja lähetä tilaus. Et maksa nyt mitään – tarkistamme tiedot ja vahvistamme hinnan ja aikataulun.",
      en: "Choose the job and start date, then place the order. No payment now – we check the details and confirm the price and schedule."
    },
    meta: { fi: "Ei maksua nyt", en: "No payment now" }
  },
  {
    title: { fi: "Toimitamme, asennamme ja noudamme", en: "We deliver, install and collect" },
    text: {
      fi: "Asentajamme pystyttävät, tarkastavat ja merkitsevät telineet. Seuraa tilausta verkossa ja pyydä nouto yhdellä painalluksella.",
      en: "Our crew installs, inspects and tags the scaffold. Follow your order online and request pickup with one click."
    },
    meta: { fi: "Seuranta verkossa", en: "Live order tracking" }
  }
];

export type SceneKind = "roof" | "facade" | "storm" | "row" | "both" | "hip";
export interface Project {
  scene: SceneKind;
  title: L;
  spec: L;
  /**
   * Your own photo of the job, e.g. "/projects/espoo-roof.jpg" (put the file in web/public/projects/).
   * When set, the photo replaces the drawing and gets the same parallax and hover zoom.
   */
  photo?: string;
}
export const PROJECTS: Project[] = [
  {
    scene: "roof",
    title: { fi: "Omakotitalo, kattoremontti", en: "Detached house, roof renovation" },
    spec: { fi: "1 kerros · 10 × 15 m · 319 m² · 4 viikkoa", en: "1 storey · 10 × 15 m · 319 m² · 4 weeks" }
  },
  {
    scene: "facade",
    title: { fi: "Kaksikerroksinen talo, julkisivumaalaus", en: "Two-storey house, facade painting" },
    spec: { fi: "2 kerrosta · 8 × 10 m · kaikki sivut", en: "2 storeys · 8 × 10 m · all sides" }
  },
  {
    scene: "storm",
    title: { fi: "Myrskyvaurio, kiirekohde", en: "Storm damage, emergency job" },
    spec: { fi: "Pystytys 24 tunnissa · räystässuoja", en: "Up within 24 h · roof-catch guard" }
  },
  {
    scene: "row",
    title: { fi: "Rivitalo, rännit ja otsalaudat", en: "Row house, gutters and fascia" },
    spec: { fi: "Räystäiden puolet · yksi työtaso", en: "Gutter sides · one working level" }
  },
  {
    scene: "both",
    title: { fi: "Puolitoistakerroksinen talo, katto ja julkisivu", en: "1½-storey house, roof and facade" },
    spec: { fi: "1½ kerrosta · 9 × 12 m · koko talo", en: "1½ storeys · 9 × 12 m · whole house" }
  },
  {
    scene: "hip",
    title: { fi: "Aumakaton uusiminen", en: "Hip roof replacement" },
    spec: { fi: "Aumakatto · räystäät joka sivulla", en: "Hip roof · eaves on every side" }
  }
];

/** Included in every price (shown once, next to the pricing heading). */
export const PRICE_FEATURES: L[] = [
  { fi: "Toimitus ja nouto", en: "Delivery and pickup" },
  { fi: "Asennus, tarkastus ja purku", en: "Installation, inspection and dismantling" },
  { fi: "Räystässuoja tarvittaessa", en: "Roof-catch guard where needed" },
  { fi: "Tilauksen seuranta verkossa", en: "Online order tracking" }
];
/** The one thing that sets each delivery speed apart (shown on its card). */
export const PRICE_EXTRA: Record<Urgency, L> = {
  standard: { fi: "Edullisin vaihtoehto", en: "Lowest price" },
  express: { fi: "Etusija asennusjonossa", en: "Priority in the install queue" },
  emergency: { fi: "Asentajat paikalla 24 tunnissa", en: "Crew on site within 24 hours" }
};

export interface Faq {
  q: L;
  a: L;
}
export const FAQ: Faq[] = [
  {
    q: { fi: "Kuinka tarkka verkossa saatu hinta on?", en: "How accurate is the instant price?" },
    a: {
      fi: "Hinta lasketaan rakennuksesi ääriviivoista ja kerrosluvusta samoilla säännöillä kuin lopullinen tarjous. Useimmiten hinta muuttuu vähän tarkistuksen jälkeen – jos jokin poikkeaa, kerromme ennen vahvistusta.",
      en: "It's calculated from your building's outline and floors with the same rules we use for the final quote. Most prices change little after we check the details – if something differs, we tell you before confirming."
    }
  },
  {
    q: { fi: "Mitä hintaan sisältyy?", en: "What's included in the price?" },
    a: {
      fi: "Telineiden vuokra valitulle ajalle, toimitus ja nouto, asennus, tarkastus ja purku sekä räystässuoja, kun työ sitä vaatii. Kokonaishinta sisältää arvonlisäveron.",
      en: "Scaffolding rent for the chosen period, delivery and pickup, installation, inspection, dismantling and the roof-catch guard when the job needs it. The total includes VAT."
    }
  },
  {
    q: { fi: "Kuinka nopeasti telineet saadaan pystyyn?", en: "How fast can you install?" },
    a: {
      fi: "Normaali toimitus on kolmessa arkipäivässä. Pikatoimitus 48 tunnissa ja kiirepystytys 24 tunnissa tilauksesta palveluosuuteen lisättävällä lisämaksulla.",
      en: "Standard delivery is three working days. Express is 48 hours and emergency 24 hours from order, with a surcharge on the service part."
    }
  },
  {
    q: { fi: "Tarvitaanko telineille lupa?", en: "Do I need a permit?" },
    a: {
      fi: "Omalla tontilla ei yleensä. Jos teline seisoo kadulla, jalkakäytävällä tai muulla yleisellä alueella, kaupunki vaatii luvan – kerromme, jos kohteesi tarvitsee sen.",
      en: "Not usually on your own plot. If the scaffold stands on a street, pavement or other public area, the city requires a permit – we'll tell you if your site needs one."
    }
  },
  {
    q: { fi: "Voinko jatkaa vuokraa tai lopettaa sen aiemmin?", en: "Can I extend the rental or end it early?" },
    a: {
      fi: "Kyllä. Jatka viikolla tai pyydä nouto seurantasivulla tilausviitteelläsi. Vuokraa laskutetaan vähintään vähimmäisvuokra-ajalta.",
      en: "Yes. Extend by a week or request pickup on the tracking page with your order reference. Rent is charged for at least the minimum rental period."
    }
  },
  {
    q: { fi: "Saako hinnasta kotitalousvähennystä?", en: "Can I claim the household tax credit?" },
    a: {
      fi: "Työn osuus (asennus ja purku) voi oikeuttaa kotitalousvähennykseen. Tarjouksessa työn osuus näkyy erikseen.",
      en: "The labour share (installation and dismantling) may qualify for the household tax credit. Your quote shows the labour share separately."
    }
  },
  {
    q: { fi: "Teettekö töitä yrityksille ja kattourakoitsijoille?", en: "Do you work with businesses and roofers?" },
    a: {
      fi: "Kyllä. Taloyhtiöt, isännöitsijät ja kattourakoitsijat saavat kumppanihinnat ja laskutuksen. Ota yhteyttä.",
      en: "Yes. Housing companies, property managers and roofing contractors get partner pricing and invoicing. Get in touch."
    }
  }
];

/** Milestones of the scroll "timelapse" (installation day). `at` is the scroll position 0–1 where it starts; on desktops the page snaps to each one. */
export const BUILD_STEPS: { at: number; time: string; label: L }[] = [
  { at: 0, time: "07:30", label: { fi: "Kuorma saapuu, osat puretaan", en: "Truck arrives, parts unloaded" } },
  { at: 0.25, time: "09:15", label: { fi: "Säätöjalat ja ensimmäinen taso", en: "Base jacks and first level" } },
  { at: 0.5, time: "11:00", label: { fi: "Toinen taso ja kaiteet", en: "Second level and guardrails" } },
  { at: 0.75, time: "12:45", label: { fi: "Päädyt ja räystässuoja", en: "Gable ends and roof-catch guard" } },
  { at: 1, time: "14:30", label: { fi: "Tarkastettu ja merkitty – valmis käyttöön", en: "Inspected and tagged – ready to use" } }
];

/** Delivery rings on the map, measured from Helsinki. */
export const COVERAGE: { km: number; speed: L; text: L }[] = [
  { km: 50, speed: { fi: "24 h", en: "24 h" }, text: { fi: "Kiirepystytys pääkaupunkiseudulla", en: "Emergency setup in the Helsinki region" } },
  { km: 100, speed: { fi: "48 h", en: "48 h" }, text: { fi: "Pikatoimitus Uudellamaalla", en: "Express delivery across Uusimaa" } },
  { km: 150, speed: { fi: "3 pv", en: "3 d" }, text: { fi: "Normaali toimitus 3 arkipäivässä", en: "Standard delivery in 3 working days" } }
];
