/**
 * SAT catalogs for CFDI 4.0. Fixed lists published by the SAT — the customer's fiscal data
 * is only usable for invoicing if it holds the exact catalog key, so these are stored as
 * codes ("601", "G03") and rendered as labels, never typed by hand.
 *
 * `fisica` / `moral` say which kind of taxpayer may use the key, which maps 1:1 onto our
 * cliente.tipo (persona / organizacion) and lets the picker hide the impossible half.
 */

export type SatEntry = {
	clave: string;
	label: string;
	fisica: boolean;
	moral: boolean;
};

/** c_RegimenFiscal. Vigentes bajo CFDI 4.0. */
export const REGIMENES_FISCALES: readonly SatEntry[] = [
	{ clave: "601", label: "General de Ley Personas Morales", fisica: false, moral: true },
	{ clave: "603", label: "Personas Morales con Fines no Lucrativos", fisica: false, moral: true },
	{ clave: "605", label: "Sueldos y Salarios e Ingresos Asimilados a Salarios", fisica: true, moral: false },
	{ clave: "606", label: "Arrendamiento", fisica: true, moral: false },
	{ clave: "607", label: "Régimen de Enajenación o Adquisición de Bienes", fisica: true, moral: false },
	{ clave: "608", label: "Demás ingresos", fisica: true, moral: false },
	{
		clave: "610",
		label: "Residentes en el Extranjero sin Establecimiento Permanente en México",
		fisica: true,
		moral: true,
	},
	{ clave: "611", label: "Ingresos por Dividendos (socios y accionistas)", fisica: true, moral: false },
	{
		clave: "612",
		label: "Personas Físicas con Actividades Empresariales y Profesionales",
		fisica: true,
		moral: false,       []
	},
	{ clave: "614", label: "Ingresos por intereses", fisica: true, moral: false },
	{ clave: "615", label: "Régimen de los ingresos por obtención de premios", fisica: true, moral: false },
	{ clave: "616", label: "Sin obligaciones fiscales", fisica: true, moral: false },
	{
		clave: "620",
		label: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
		fisica: false,
		moral: true,
	},
	{ clave: "621", label: "Incorporación Fiscal", fisica: true, moral: false },
	{ clave: "622", label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", fisica: true, moral: true },
	{ clave: "623", label: "Opcional para Grupos de Sociedades", fisica: false, moral: true },
	{ clave: "624", label: "Coordinados", fisica: false, moral: true },
	{
		clave: "625",
		label: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
		fisica: true,
		moral: false,
	},
	{ clave: "626", label: "Régimen Simplificado de Confianza", fisica: true, moral: true },
	{ clave: "628", label: "Hidrocarburos", fisica: false, moral: true },
	{
		clave: "629",
		label: "De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales",
		fisica: false,
		moral: true,
	},
	{ clave: "630", label: "Enajenación de acciones en bolsa de valores", fisica: true, moral: true },
];

/** c_UsoCFDI. Vigentes bajo CFDI 4.0. */
export const USOS_CFDI: readonly SatEntry[] = [
	{ clave: "G01", label: "Adquisición de mercancías", fisica: true, moral: true },
	{ clave: "G02", label: "Devoluciones, descuentos o bonificaciones", fisica: true, moral: true },
	{ clave: "G03", label: "Gastos en general", fisica: true, moral: true },
	{ clave: "I01", label: "Construcciones", fisica: true, moral: true },
	{ clave: "I02", label: "Mobiliario y equipo de oficina por inversiones", fisica: true, moral: true },
	{ clave: "I03", label: "Equipo de transporte", fisica: true, moral: true },
	{ clave: "I04", label: "Equipo de cómputo y accesorios", fisica: true, moral: true },
	{ clave: "I05", label: "Dados, troqueles, moldes, matrices y herramental", fisica: true, moral: true },
	{ clave: "I06", label: "Comunicaciones telefónicas", fisica: true, moral: true },
	{ clave: "I07", label: "Comunicaciones satelitales", fisica: true, moral: true },
	{ clave: "I08", label: "Otra maquinaria y equipo", fisica: true, moral: true },
	{ clave: "D01", label: "Honorarios médicos, dentales y gastos hospitalarios", fisica: true, moral: false },
	{ clave: "D02", label: "Gastos médicos por incapacidad o discapacidad", fisica: true, moral: false },
	{ clave: "D03", label: "Gastos funerales", fisica: true, moral: false },
	{ clave: "D04", label: "Donativos", fisica: true, moral: false },
	{ clave: "D05", label: "Intereses reales por créditos hipotecarios (casa habitación)", fisica: true, moral: false },
	{ clave: "D06", label: "Aportaciones voluntarias al SAR", fisica: true, moral: false },
	{ clave: "D07", label: "Primas por seguros de gastos médicos", fisica: true, moral: false },
	{ clave: "D08", label: "Gastos de transportación escolar obligatoria", fisica: true, moral: false },
	{ clave: "D09", label: "Depósitos en cuentas para el ahorro y planes de pensiones", fisica: true, moral: false },
	{ clave: "D10", label: "Pagos por servicios educativos (colegiaturas)", fisica: true, moral: false },
	{ clave: "S01", label: "Sin efectos fiscales", fisica: true, moral: true },
	{ clave: "CP01", label: "Pagos", fisica: true, moral: true },
	{ clave: "CN01", label: "Nómina", fisica: true, moral: false },
];

const find = (catalogo: readonly SatEntry[], clave: string | null | undefined) =>
	clave ? (catalogo.find((e) => e.clave === clave) ?? null) : null;

export const regimenFiscal = (clave: string | null | undefined) => find(REGIMENES_FISCALES, clave);
export const usoCfdi = (clave: string | null | undefined) => find(USOS_CFDI, clave);

/** "601 — General de Ley Personas Morales", or the raw key if it is no longer in the catalog. */
export function satLabel(catalogo: readonly SatEntry[], clave: string | null | undefined): string | null {
	if (!clave) return null;
	const entry = find(catalogo, clave);
	return entry ? `${entry.clave} — ${entry.label}` : clave;
}

/** The half of a catalog a given customer type may legally use. */
export function satParaTipo(catalogo: readonly SatEntry[], tipo: "persona" | "organizacion"): readonly SatEntry[] {
	return catalogo.filter((e) => (tipo === "persona" ? e.fisica : e.moral));
}

// ================================================================================================
// c_ClaveUnidad y c_ClaveProdServ — para el catálogo de productos
// ================================================================================================

/**
 * A curated slice of the SAT catalogues, not the whole thing.
 *
 * `c_ClaveProdServ` has ~52,000 entries and `c_ClaveUnidad` ~2,400. Shipping either in full would
 * put megabytes into the bundle to serve a shop that uses two dozen of them. These are the keys a
 * mechanic shop actually bills, and the field accepts any well-formed clave besides — the picker
 * is a shortcut, not a whitelist. The 8-digit format is enforced by `producto_clave_prodserv_check`.
 *
 * ponytail: curated list. If the shop starts billing something exotic often, add it here rather
 * than importing the full catalogue — and if that stops scaling, the upgrade is a `sat_clave`
 * table loaded from the SAT's published CSV, not a bigger constant.
 */

export type SatClave = { clave: string; descripcion: string };

export const CLAVES_UNIDAD: readonly SatClave[] = [
	{ clave: "H87", descripcion: "Pieza" },
	{ clave: "EA", descripcion: "Elemento" },
	{ clave: "E48", descripcion: "Unidad de servicio" },
	{ clave: "ACT", descripcion: "Actividad" },
	{ clave: "HUR", descripcion: "Hora" },
	{ clave: "DAY", descripcion: "Día" },
	{ clave: "LTR", descripcion: "Litro" },
	{ clave: "MLT", descripcion: "Mililitro" },
	{ clave: "KGM", descripcion: "Kilogramo" },
	{ clave: "GRM", descripcion: "Gramo" },
	{ clave: "MTR", descripcion: "Metro" },
	{ clave: "CMT", descripcion: "Centímetro" },
	{ clave: "SET", descripcion: "Juego" },
	{ clave: "PR", descripcion: "Par" },
	{ clave: "XBX", descripcion: "Caja" },
	{ clave: "XKI", descripcion: "Kit" },
	{ clave: "GLL", descripcion: "Galón" },
] as const;

/** Sensible default for a physical part. */
export const CLAVE_UNIDAD_DEFAULT = "H87";
/** Sensible default for labour and external services. */
export const CLAVE_UNIDAD_SERVICIO = "E48";

export const CLAVES_PROD_SERV: readonly SatClave[] = [
	// Mano de obra y servicios de taller
	{ clave: "78181500", descripcion: "Servicios de mantenimiento y reparación de vehículos" },
	{ clave: "78181501", descripcion: "Servicio de reparación de automóviles" },
	{ clave: "78181507", descripcion: "Servicio de afinación de vehículos" },
	{ clave: "72101511", descripcion: "Servicio de hojalatería y pintura" },
	{ clave: "78181505", descripcion: "Servicio de alineación y balanceo" },
	{ clave: "78181502", descripcion: "Servicio de cambio de aceite y lubricación" },
	{ clave: "25191700", descripcion: "Servicio de diagnóstico automotriz" },
	{ clave: "78180000", descripcion: "Mantenimiento y reparación de equipo de transporte" },
	// Refacciones
	{ clave: "25170000", descripcion: "Componentes y sistemas de vehículos" },
	{ clave: "25172500", descripcion: "Sistemas de frenos y componentes" },
	{ clave: "25172504", descripcion: "Balatas / pastillas de freno" },
	{ clave: "25172503", descripcion: "Discos y tambores de freno" },
	{ clave: "25171700", descripcion: "Sistemas de suspensión y componentes" },
	{ clave: "25171713", descripcion: "Amortiguadores" },
	{ clave: "25171900", descripcion: "Sistemas de dirección" },
	{ clave: "25172000", descripcion: "Sistemas de transmisión" },
	{ clave: "25173100", descripcion: "Sistemas eléctricos de vehículos" },
	{ clave: "26111700", descripcion: "Baterías y acumuladores" },
	{ clave: "25172700", descripcion: "Sistemas de escape" },
	{ clave: "25172200", descripcion: "Sistemas de enfriamiento del motor" },
	{ clave: "25172100", descripcion: "Motores y componentes" },
	{ clave: "25174800", descripcion: "Llantas y neumáticos" },
	{ clave: "25171500", descripcion: "Carrocería y accesorios exteriores" },
	{ clave: "25173900", descripcion: "Sistemas de aire acondicionado de vehículos" },
	// Insumos y consumibles
	{ clave: "15121500", descripcion: "Aceites lubricantes para motor" },
	{ clave: "15121800", descripcion: "Grasas lubricantes" },
	{ clave: "12352100", descripcion: "Anticongelante y refrigerantes" },
	{ clave: "40161500", descripcion: "Filtros" },
	{ clave: "40161505", descripcion: "Filtro de aceite" },
	{ clave: "40161506", descripcion: "Filtro de aire" },
	{ clave: "31201500", descripcion: "Adhesivos y selladores" },
	{ clave: "47131700", descripcion: "Productos de limpieza" },
	{ clave: "31161500", descripcion: "Tornillería y sujetadores" },
] as const;

/** Defaults per product type, so nobody hunts for a clave to enter an hour of labour. */
export const CLAVE_PROD_SERV_DEFAULT: Record<string, string> = {
	refaccion: "25170000",
	mano_obra: "78181500",
	insumo: "40161500",
	externo: "78181500",
};

const buscaClave = (catalogo: readonly SatClave[], clave: string | null | undefined) =>
	clave ? catalogo.find((c) => c.clave === clave) : undefined;

export const claveProdServLabel = (clave: string | null | undefined): string =>
	buscaClave(CLAVES_PROD_SERV, clave)?.descripcion ?? clave ?? "";

export const claveUnidadLabel = (clave: string | null | undefined): string =>
	buscaClave(CLAVES_UNIDAD, clave)?.descripcion ?? clave ?? "";

/** The format the SAT and `producto_clave_prodserv_check` both require. */
export const esClaveProdServ = (v: unknown): v is string => typeof v === "string" && /^[0-9]{8}$/.test(v);

export const esClaveUnidad = (v: unknown): v is string => typeof v === "string" && /^[A-Z0-9]{1,3}$/.test(v);
