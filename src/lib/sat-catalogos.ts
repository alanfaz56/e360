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
	{ clave: "610", label: "Residentes en el Extranjero sin Establecimiento Permanente en México", fisica: true, moral: true },
	{ clave: "611", label: "Ingresos por Dividendos (socios y accionistas)", fisica: true, moral: false },
	{ clave: "612", label: "Personas Físicas con Actividades Empresariales y Profesionales", fisica: true, moral: false },
	{ clave: "614", label: "Ingresos por intereses", fisica: true, moral: false },
	{ clave: "615", label: "Régimen de los ingresos por obtención de premios", fisica: true, moral: false },
	{ clave: "616", label: "Sin obligaciones fiscales", fisica: true, moral: false },
	{ clave: "620", label: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos", fisica: false, moral: true },
	{ clave: "621", label: "Incorporación Fiscal", fisica: true, moral: false },
	{ clave: "622", label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", fisica: true, moral: true },
	{ clave: "623", label: "Opcional para Grupos de Sociedades", fisica: false, moral: true },
	{ clave: "624", label: "Coordinados", fisica: false, moral: true },
	{ clave: "625", label: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas", fisica: true, moral: false },
	{ clave: "626", label: "Régimen Simplificado de Confianza", fisica: true, moral: true },
	{ clave: "628", label: "Hidrocarburos", fisica: false, moral: true },
	{ clave: "629", label: "De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales", fisica: false, moral: true },
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
export function satParaTipo(
	catalogo: readonly SatEntry[],
	tipo: "persona" | "organizacion",
): readonly SatEntry[] {
	return catalogo.filter((e) => (tipo === "persona" ? e.fisica : e.moral));
}
