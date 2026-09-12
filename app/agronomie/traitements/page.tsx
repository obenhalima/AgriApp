"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { validateTreatmentDates } from "@/lib/treatmentScheduleDates";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  FlaskConical,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea, Field } from "@/components/ui/Input";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { DataTable, THead, TR, TH, TD } from "@/components/ui/DataTable";
import { DateDisplay } from "@/components/display";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { useReferenceList } from "@/lib/useReferenceList";

const STATUS: Record<
  string,
  {
    label: string;
    variant: "warning" | "success" | "danger" | "info" | "default";
  }
> = {
  soumise: { label: "À valider", variant: "warning" },
  approuvee: { label: "À confirmer", variant: "success" },
  rejetee: { label: "Rejetée", variant: "danger" },
  executee: { label: "Réalisée", variant: "info" },
  annulee: { label: "Non réalisée", variant: "default" },
};
const emptyProduct = () => ({
  catalog_product_id: "",
  stock_item_id: "",
  dose: "",
  dose_unit: "ml_100l",
  planned_quantity: "",
  calculated_quantity: "",
  quantity_is_manual: false,
  quantity_override_justification: "",
  phi_days: "",
  rei_hours: "",
  label_confirmed: false,
});
const blankRequest = () => ({
  farm_id: "",
  warehouse_id: "",
  target_planting_ids: [] as string[],
  schedule_mode: "single",
  exact_dates: [""],
  frequency: "weekly",
  interval_value: "1",
  starts_at: "",
  ends_at: "",
  occurrence_count: "",
  target_name: "",
  custom_target: "",
  diagnosis: "",
  justification: "",
  treated_area_m2: "",
  spray_volume_l_ha: "1000",
  water_volume_liters: "",
  temperature_c: "",
  humidity_pct: "",
  notes: "",
  products: [emptyProduct()],
});
const parseLocalizedNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatQuantity = (value: unknown) => {
  if (value == null || String(value).trim() === '') return '';
  return parseLocalizedNumber(value).toLocaleString('fr-FR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).replace(/\s/g, ' ');
};
const normalizeDoseUnit = (value: string) => {
  const unit = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/³/g, "3")
    .replace(/²/g, "2")
    .replace(/[éèê]/g, "e")
    .replace(/\s+/g, "")
    .replace(/\//g, "_");
  const aliases: Record<string, string> = {
    "ml_100l": "ml_100l",
    "ml_hl": "ml_100l",
    "cc_100l": "ml_100l",
    "cc_hl": "ml_100l",
    "g_100l": "g_100l",
    "g_hl": "g_100l",
    "l_ha": "l_ha",
    "kg_ha": "kg_ha",
    "ml_ha": "ml_ha",
    "g_ha": "g_ha",
    "unite_ha": "unite_ha",
    "l_1000m2": "l_1000m2",
    "kg_1000m2": "kg_1000m2",
  };
  return aliases[unit] || value;
};
const plannedQuantity = (
  doseValue: unknown,
  unit: string,
  areaValue: unknown,
  waterValue: unknown,
  stockUnit: string,
) => {
  const dose = parseLocalizedNumber(doseValue);
  const area = parseLocalizedNumber(areaValue);
  const water = parseLocalizedNumber(waterValue);
  unit = normalizeDoseUnit(unit);
  let value = 0,
    source = "";
  if (unit === "ml_100l" || unit === "g_100l") {
    value = (dose * water) / 100;
    source = unit.startsWith("ml") ? "ml" : "g";
  } else if (["l_ha", "kg_ha", "ml_ha", "g_ha", "unite_ha"].includes(unit)) {
    value = (dose * area) / 10000;
    source = unit.split("_")[0];
  } else if (["l_1000m2", "kg_1000m2"].includes(unit)) {
    value = (dose * area) / 1000;
    source = unit.split("_")[0];
  }
  const aliases:Record<string,string>={litre:"l",litres:"l",millilitre:"ml",millilitres:"ml",gramme:"g",grammes:"g",kilogramme:"kg",kilogrammes:"kg","unité":"unite","unités":"unite",piece:"unite","pièce":"unite","pièces":"unite"};
  const raw=stockUnit.trim().toLowerCase(),target=aliases[raw]||raw||source;
  const units:Record<string,{family:string;factor:number}>={ml:{family:"volume",factor:0.001},l:{family:"volume",factor:1},g:{family:"masse",factor:0.001},kg:{family:"masse",factor:1},unite:{family:"nombre",factor:1}};
  if(!units[source]||!units[target]||units[source].family!==units[target].family)return "";
  value=value*units[source].factor/units[target].factor;
  return value ? String(Math.round(value * 10000) / 10000) : "";
};

export default function TraitementsPage() {
  const { activeDomain, user } = useAuth();
  const { values: doseUnits } = useReferenceList("phyto_dose_unit");
  const [requests, setRequests] = useState<any[]>([]),
    [plantings, setPlantings] = useState<any[]>([]),
    [products, setProducts] = useState<any[]>([]),
    [workers, setWorkers] = useState<any[]>([]),
    [stationEligibility, setStationEligibility] = useState<any[]>([]),
    [verifiedTargets, setVerifiedTargets] = useState<any[]>([]);
  const [warehouses,setWarehouses]=useState<any[]>([]);
  const [forecastError,setForecastError]=useState("");
  const [workerLoadError,setWorkerLoadError]=useState("");
  const [productLoadError,setProductLoadError]=useState("");
  const [canValidate, setCanValidate] = useState(false),
    [canConfirm, setCanConfirm] = useState(false);
  const [defaultSprayVolumeLHa, setDefaultSprayVolumeLHa] = useState(1000);
  const [requireReentryDelay,setRequireReentryDelay] = useState(true);
  const [hasActiveStationList, setHasActiveStationList] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false),
    [confirming, setConfirming] = useState<any>(null),
    [checking, setChecking] = useState<any>(null),
    [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankRequest());
  const [datesAttempted, setDatesAttempted] = useState(false);
  const dateValidation = validateTreatmentDates(form);
  const dateFieldProps = (key: string) => ({
    'aria-invalid': datesAttempted && !!dateValidation.errors[key],
    className: datesAttempted && dateValidation.errors[key] ? 'border-danger focus:border-danger' : undefined,
  });
  const [confirmation, setConfirmation] = useState<any>({
    application_status: "realisee",
    actual_started_at: "",
    actual_ended_at: "",
    applicator_worker_id: "",
    temperature_c: "",
    humidity_pct: "",
    wind_notes: "",
    non_execution_reason: "",
    deviation_notes: "",
    notes: "",
    actual_treated_area_m2: "",
    actual_water_volume_liters: "",
    actual_spray_volume_l_ha: "1000",
    actual_products: {},
    actual_product_overrides: {},
    actual_product_justifications: {},
  });
  const [efficacy, setEfficacy] = useState<any>({
    checked_at: "",
    efficacy_pct: "",
    infestation_before: "",
    infestation_after: "",
    reinfection_observed: false,
    corrective_action: "",
    observations: "",
  });

  const load = async () => {
    if (!activeDomain) return;
    const d = activeDomain.domain_id;
    const [r, p, s, u, catalog, w, cv, station, verifiedTargetRows, activeList, cfg, cc] = await Promise.all([
      supabase
        .from("treatment_requests")
        .select(
          "*,treatment_request_targets(*,campaign_plantings(greenhouses(name),varieties(commercial_name))),treatment_request_products(*,stock_items(name,unit,current_qty)),treatment_applications(*),treatment_efficacy_checks(id,checked_at,efficacy_pct)",
        )
        .eq("domain_id", d)
        .order("created_at", { ascending: false }),
      supabase
        .from("campaign_plantings")
        .select(
          "id,planted_area,greenhouses(id,name,farm_id,exploitable_area,farms(id,name)),varieties(commercial_name)",
        )
        .eq("domain_id", d),
      supabase.rpc("get_phyto_stock_projection", { p_domain: d }),
      supabase
        .from("product_authorized_uses")
        .select("*")
        .eq("domain_id", d),
      supabase
        .from("plant_protection_products")
        .select("id,commercial_name,authorization_status,is_active,safety_data_verified,default_phi_days,default_rei_hours")
        .eq("domain_id", d)
        .order("commercial_name"),
      supabase
        .from("workers")
        .select("id,first_name,last_name,is_active,farm_id,direct_farm:farms!workers_farm_id_fkey(domain_id),teams(farms(domain_id))")
        .eq("is_active", true)
        .order("last_name"),
      supabase.rpc("has_business_capability", {
        p_domain: d,
        p_user: user?.id,
        p_capability: "treatment.validate",
        p_farm: null,
      }),
      supabase.from("v_active_station_phyto_products").select("target_id,target_name,product_id,authorized_use_id,authorization_status,safety_data_verified,linked_to_stock,regulatory_ready").eq("domain_id", d),
      supabase.from("phyto_targets").select("id,canonical_name,category").eq("is_active",true).eq("is_verified",true).order("canonical_name"),
      supabase.from("phyto_positive_lists").select("id").eq("domain_id",d).eq("status","active").limit(1).maybeSingle(),
      supabase.from("phyto_compliance_settings").select("default_spray_volume_l_ha,require_reentry_delay").eq("domain_id", d).maybeSingle(),
      supabase.rpc("has_business_capability", {
        p_domain: d,
        p_user: user?.id,
        p_capability: "treatment.confirm_application",
        p_farm: null,
      }),
    ]);
    if (r.error && !r.error.message.includes("treatment_applications"))
      toast.error(r.error.message);
    const [wh,forecast]=await Promise.all([
      supabase.from("warehouses").select("id,name,farm_id,is_active,is_default").eq("domain_id",d).order("name"),
      supabase.rpc("get_treatment_stock_forecast",{p_domain:d}),
    ]);
    setWarehouses(wh.data||[]);
    setForecastError(forecast.error?.message||wh.error?.message||"");
    setRequests((r.data || []).map(request=>({...request,stock_forecast:(forecast.data||[]).find((f:any)=>f.request_id===request.id)})));
    setPlantings(p.data || []);
    setProducts(
      (catalog.data || []).map((product: any) => {
        const stock = (s.data || []).find(
          (item: any) => item.plant_protection_product_id === product.id,
        );
        return {
          ...product,
          catalog_product_id: product.id,
          stock_item_id: stock?.stock_item_id || "",
          name: product.commercial_name,
          unit: stock?.unit || "",
          current_qty: stock?.current_qty ?? null,
          projected_qty: stock?.projected_qty ?? null,
          authorized_uses: (u.data || []).filter(
            (use: any) => use.product_id === product.id,
          ),
        };
      }),
    );
    setWorkers(
      (w.data || []).filter((x: any) => (x.farm_id ? x.direct_farm?.domain_id : x.teams?.farms?.domain_id) === d),
    );
    setWorkerLoadError(w.error?.message || "");
    setCanValidate(Boolean(cv.data));
    setCanConfirm(Boolean(cc.data));
    setDefaultSprayVolumeLHa(Number(cfg.data?.default_spray_volume_l_ha) || 1000);
    setRequireReentryDelay(cfg.error ? true : cfg.data?.require_reentry_delay !== false);
    setStationEligibility(station.data || []);
    setProductLoadError([station.error,activeList.error,catalog.error,u.error,s.error,verifiedTargetRows.error].filter(Boolean).map(e=>e!.message).join(" · "));
    setVerifiedTargets(verifiedTargetRows.data || []);
    setHasActiveStationList(Boolean(activeList.data));
  };
  useEffect(() => {
    load();
  }, [activeDomain?.domain_id, user?.id]);

  const targetOptions = useMemo(
    () => verifiedTargets.map((target:any)=>target.canonical_name).filter(Boolean).sort((a:any,b:any)=>String(a).localeCompare(String(b),'fr')) as string[],
    [verifiedTargets],
  );
  const normalizedTarget=(name:string)=>String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLocaleLowerCase("fr");
  const targetId=(name:string)=>verifiedTargets.find(t=>normalizedTarget(t.canonical_name)===normalizedTarget(name))?.id;
  const matchesStationTarget=(entry:any,name:string)=>targetId(name)?entry.target_id===targetId(name):normalizedTarget(entry.target_name)===normalizedTarget(name);
  const isStationEligible = (product:any,target:string) => !productLoadError && (hasActiveStationList
    ? stationEligibility.some((entry:any)=>entry.product_id===product.catalog_product_id&&matchesStationTarget(entry,target))
    : (product.authorized_uses || []).some((use:any)=>use.is_active&&normalizedTarget(use.target_name)===normalizedTarget(target)));
  const productsForTarget = (target:string) => products.filter((product:any)=>isStationEligible(product,target));
  const getAuthorizedUse = (product:any,target:string) => {
    const links=stationEligibility.filter((e:any)=>e.product_id===product?.catalog_product_id&&matchesStationTarget(e,target));
    const uses=product?.authorized_uses||[];
    const matching=uses.filter((u:any)=>normalizedTarget(u.crop_name)==="tomate"&&
      (links.some((e:any)=>e.authorized_use_id===u.id)||normalizedTarget(u.target_name)===normalizedTarget(target)));
    return matching.find((u:any)=>u.is_active)
      || matching.find((u:any)=>links.some((e:any)=>e.authorized_use_id===u.id));
  };
  const hasStationCompliance=(p:any,target:string)=> {
    const use=getAuthorizedUse(p,target);
    return !!use && stationEligibility.some((e:any)=>e.product_id===p.catalog_product_id&&e.authorized_use_id===use.id&&matchesStationTarget(e,target));
  };
  const productUnavailableReason=(p:any,target:string)=>[
    !p.stock_item_id?"Article de stock à créer":null,
    !p.is_active?"Produit inactif":null,
    ['suspendu','retire','expire'].includes(p.authorization_status)?"Produit suspendu, retiré ou expiré":!hasStationCompliance(p,target)&&(p.authorization_status!=="autorise"||!p.safety_data_verified)?"ONSSA à vérifier":null,
    !getAuthorizedUse(p,target)?"Usage pour cette cible à compléter":!getAuthorizedUse(p,target).is_active&&!hasStationCompliance(p,target)?"Données importées préremplies — usage à vérifier":null,
  ].filter(Boolean).join(" · ");
  const currentTargetName = (value:any) => value.target_name === "__other__" ? value.custom_target : value.target_name;

  const changeProduct = (index: number, key: string, value: any) =>
    setForm((current) => ({
      ...current,
      products: current.products.map((line: any, i: number) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    }));
  const selectedArea = (ids: string[]) =>
    ids.reduce((sum, id) => {
      const p = plantings.find((x: any) => x.id === id);
      return (
        sum + Number(p?.planted_area || p?.greenhouses?.exploitable_area || 0)
      );
    }, 0);
  const recalcLines = (lines: any[], area: number, water: number) =>
    lines.map((line) => {
      const item = products.find(
        (p: any) => line.catalog_product_id?p.catalog_product_id===line.catalog_product_id:!!line.stock_item_id&&p.stock_item_id === line.stock_item_id,
      );
      const calculated = plannedQuantity(
        line.dose,
        line.dose_unit,
        area,
        water,
        item?.unit || "",
      );
      return {
        ...line,
        calculated_quantity: calculated,
        planned_quantity: line.quantity_is_manual
          ? line.planned_quantity
          : calculated,
      };
    });
  const setTargets = (ids: string[]) =>
    setForm((current) => {
      const area = selectedArea(ids),
        reference = getAuthorizedUse(products.find(
          (p: any) => p.stock_item_id === current.products[0]?.stock_item_id,
        ), currentTargetName(current))?.spray_volume_reference_l_ha;
      const volumePerHa = Number(reference) || defaultSprayVolumeLHa;
      const water = area ? Math.round(((area * volumePerHa) / 10000) * 100) / 100 : 0;
      return {
        ...current,
        target_planting_ids: ids,
        treated_area_m2: String(area),
        spray_volume_l_ha: String(volumePerHa),
        water_volume_liters: water ? String(water) : "",
        products: recalcLines(current.products, area, water),
      };
    });
  const chooseProduct = (index: number, catalogProductId: string) => {
    const item = products.find((p: any) => p.catalog_product_id === catalogProductId),
      use = getAuthorizedUse(item, currentTargetName(form));
    setForm((current) => {
      const dose =
          use?.dose_min ?? use?.recommended_dose ?? use?.dose_max ?? "",
        area = Number(current.treated_area_m2) || 0,
        volumePerHa = Number(use?.spray_volume_reference_l_ha) || defaultSprayVolumeLHa,
        water = area ? Math.round(((area * volumePerHa) / 10000) * 100) / 100 : 0;
      const line = {
        ...current.products[index],
        stock_item_id: item?.stock_item_id || "",
        catalog_product_id: item?.catalog_product_id || "",
        dose,
        dose_unit: use?.dose_unit || "ml_100l",
        phi_days: use?.phi_days ?? item?.default_phi_days ?? "",
        rei_hours: use?.rei_hours ?? item?.default_rei_hours ?? "",
        quantity_is_manual: false,
        quantity_override_justification: "",
      };
      line.planned_quantity = plannedQuantity(
        dose,
        line.dose_unit,
        area,
        water,
        item?.unit || "",
      );
      line.calculated_quantity = line.planned_quantity;
      return {
        ...current,
        water_volume_liters: water
          ? String(water)
          : current.water_volume_liters,
        spray_volume_l_ha: String(volumePerHa),
        products: current.products.map((old: any, i: number) =>
          i === index ? line : old,
        ),
      };
    });
  };
  const chooseTarget = (target: string) => {
    // Une nouvelle cible impose un choix explicite et de nouvelles doses vérifiées.
    setForm(current=>current.target_name===target?current:{...current,target_name:target,products:[emptyProduct()]});
  };
  const submit = async () => {
    if (saving) return;
    setDatesAttempted(true);
    const validatedDates = validateTreatmentDates(form);
    if (Object.keys(validatedDates.errors).length) {
      toast.error("Corrigez les dates de planification signalées en rouge.");
      return;
    }
    const effectiveTarget = currentTargetName(form);
    if (!form.farm_id || !warehouses.some(w=>w.id===form.warehouse_id&&w.is_active&&w.farm_id===form.farm_id)) {
      toast.error("Sélectionnez un entrepôt actif rattaché à la ferme de la prescription.");
      return;
    }
    if(productLoadError||form.products.some(line=>{
      const item=products.find(p=>line.catalog_product_id?p.catalog_product_id===line.catalog_product_id:!!line.stock_item_id&&p.stock_item_id===line.stock_item_id);
      return !item||!item.is_active||!getAuthorizedUse(item,effectiveTarget)||!isStationEligible(item,effectiveTarget);
    })){
      toast.error("Complétez ou retirez les produits signalés avant de soumettre la prescription.");
      return;
    }
    if (
      !activeDomain ||
      !form.warehouse_id ||
      !form.target_planting_ids.length ||
      !effectiveTarget ||
      !form.diagnosis ||
      !form.justification ||
      !form.treated_area_m2 ||
      form.products.some(
        (p: any) =>
          !p.catalog_product_id ||
          !p.dose ||
          !p.planned_quantity ||
          (p.quantity_is_manual &&
            !p.quantity_override_justification?.trim()) ||
          !p.label_confirmed,
      )
    ) {
      toast.error(
        "Complète la planification, les serres, le diagnostic et tous les produits.",
      );
      return;
    }
    setSaving(true);
    try {
    const schedule = {
      schedule_mode: form.schedule_mode,
      name: `${effectiveTarget} — ${new Date().toLocaleDateString("fr-FR")}`,
      exact_dates: validatedDates.exact_dates,
      frequency: form.frequency,
      interval_value: form.interval_value,
      starts_at: validatedDates.starts_at,
      ends_at: validatedDates.ends_at,
      occurrence_count: form.occurrence_count,
    };
    const { error } = await supabase.rpc("submit_treatment_schedule", {
      p_schedule: schedule,
      p_request: {
        domain_id: activeDomain.domain_id,
        warehouse_id: form.warehouse_id,
        target_planting_ids: form.target_planting_ids,
        target_name: effectiveTarget,
        diagnosis: form.diagnosis,
        justification: form.justification,
        treated_area_m2: form.treated_area_m2,
        water_volume_liters: parseLocalizedNumber(form.water_volume_liters),
        temperature_c: form.temperature_c,
        humidity_pct: form.humidity_pct,
        notes: form.notes,
      },
      p_products: form.products.map((p: any) => ({
        ...p,
        dose: parseLocalizedNumber(p.dose),
        planned_quantity: parseLocalizedNumber(p.planned_quantity),
        calculated_quantity: parseLocalizedNumber(p.calculated_quantity),
        phi_days: Number(p.phi_days) || 0,
        rei_hours: Number(p.rei_hours) || 0,
      })),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plan de prescription généré et soumis à validation");
    setRequestOpen(false);
    setForm(blankRequest());
    setDatesAttempted(false);
    load();
    } catch (error: any) {
      toast.error(error?.message || "Impossible d’enregistrer la prescription.");
    } finally {
      setSaving(false);
    }
  };
  const review = async (id: string, approve: boolean) => {
    const reason = approve ? null : prompt("Motif obligatoire du rejet :");
    if (!approve && !reason) return;
    const { error } = await supabase.rpc("review_treatment_request", {
      p_request_id: id,
      p_approve: approve,
      p_reason: reason,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(approve ? "Traitement approuvé" : "Traitement rejeté");
      load();
    }
  };
  const resolveStock = async (id: string) => {
    const {data,error}=await supabase.rpc("resolve_treatment_stock",{p_request:id});
    if(error) toast.error(error.message);
    else { toast.success(data?`${data} article(s) rattaché(s)`:"Aucun nouvel article trouvé : préparez les articles de stock puis réessayez."); load(); }
  };
  const calculatedActualProducts = (request: any, current: any, areaValue: unknown, waterValue: unknown) =>
    Object.fromEntries((request.treatment_request_products || []).map((p: any) => {
      const keepManual = current?.actual_product_overrides?.[p.id];
      const calculated = plannedQuantity(p.dose, p.dose_unit, areaValue, waterValue, p.stock_items?.unit || "");
      return [p.id, keepManual ? current.actual_products[p.id] : calculated];
    }));
  const updateActualVolumes = (mode: "area" | "perHa" | "total", raw: string) =>
    setConfirmation((current: any) => {
      let area = mode === "area" ? parseLocalizedNumber(raw) : parseLocalizedNumber(current.actual_treated_area_m2);
      let perHa = mode === "perHa" ? parseLocalizedNumber(raw) : parseLocalizedNumber(current.actual_spray_volume_l_ha);
      let water = mode === "total" ? parseLocalizedNumber(raw) : parseLocalizedNumber(current.actual_water_volume_liters);
      if (mode === "total") perHa = area > 0 ? Math.round((water / (area / 10000)) * 100) / 100 : 0;
      else water = area > 0 && perHa > 0 ? Math.round(((area * perHa) / 10000) * 100) / 100 : 0;
      const next = {...current,actual_treated_area_m2:mode === "area" ? raw : String(area||""),actual_spray_volume_l_ha:mode === "perHa" ? raw : String(perHa||""),actual_water_volume_liters:mode === "total" ? raw : String(water||"")};
      return {...next,actual_products:calculatedActualProducts(confirming,next,area,water)};
    });
  const openConfirmation = (request: any) => {
    const area = Number(request.treated_area_m2) || 0;
    const water = Number(request.water_volume_liters) || (area * defaultSprayVolumeLHa) / 10000;
    const perHa = area ? Math.round((water / (area / 10000)) * 100) / 100 : defaultSprayVolumeLHa;
    setConfirming(request);
    const initial:any = {
      homogeneous_cost_allocation: false,
      actual_cost_areas: Object.fromEntries((request.treatment_request_targets || []).map((t:any) => [t.campaign_planting_id, String(t.treated_area_m2 ?? '')])),
      application_status: "realisee",
      actual_started_at: new Date().toISOString().slice(0, 16),
      actual_ended_at: "",
      applicator_worker_id: "",
      temperature_c: request.temperature_c ?? "",
      humidity_pct: request.humidity_pct ?? "",
      wind_notes: "",
      non_execution_reason: "",
      deviation_notes: "",
      notes: "",
      actual_treated_area_m2: String(area),
      actual_water_volume_liters: String(water),
      actual_spray_volume_l_ha: String(perHa),
      actual_product_overrides: {},
      actual_product_justifications: {},
      actual_products: {},
    };
    initial.actual_products=calculatedActualProducts(request,initial,area,water);
    setConfirmation(initial);
  };
  const confirmApplication = async () => {
    if (!confirming) return;
    if (confirmation.application_status !== "non_realisee" && (confirming.treatment_request_products || []).some((p:any)=>!p.stock_item_id)) {
      toast.error("Créez puis rattachez les articles de stock avant de confirmer l’application réelle.");
      return;
    }
    if (
      confirmation.application_status !== "non_realisee" &&
      !confirmation.applicator_worker_id
    ) {
      toast.error("Sélectionne l’applicateur.");
      return;
    }
    if (confirmation.application_status !== "non_realisee" && (!parseLocalizedNumber(confirmation.actual_treated_area_m2) || !parseLocalizedNumber(confirmation.actual_water_volume_liters))) {
      toast.error("Renseigne la surface réelle et le volume réel de bouillie.");
      return;
    }
    if (confirmation.application_status !== "non_realisee" && (confirming.treatment_request_products || []).some((p:any)=>!parseLocalizedNumber(confirmation.actual_products[p.id])||(confirmation.actual_product_overrides[p.id]&&!confirmation.actual_product_justifications[p.id]?.trim()))) {
      toast.error("Vérifie les quantités réelles et justifie chaque modification manuelle.");
      return;
    }
    if (
      confirmation.application_status === "non_realisee" &&
      !confirmation.non_execution_reason
    ) {
      toast.error("Le motif de non-réalisation est obligatoire.");
      return;
    }
    setSaving(true);
    const actual = (confirming.treatment_request_products || []).map(
      (p: any) => ({
        request_product_id: p.id,
        actual_quantity: parseLocalizedNumber(confirmation.actual_products[p.id]),
        quantity_is_manual: Boolean(confirmation.actual_product_overrides[p.id]),
        quantity_override_justification: confirmation.actual_product_justifications[p.id] || null,
      }),
    );
    const { error } = await supabase.rpc("confirm_treatment_application", {
      p_request: confirming.id,
      p_application: {
        ...confirmation,
        actual_cost_areas: confirmation.homogeneous_cost_allocation ? undefined : Object.fromEntries(Object.entries(confirmation.actual_cost_areas || {}).map(([id, value]) => [id, parseLocalizedNumber(String(value))])),
        actual_products: undefined,
        actual_started_at: confirmation.actual_started_at
          ? new Date(confirmation.actual_started_at).toISOString()
          : null,
        actual_ended_at: confirmation.actual_ended_at
          ? new Date(confirmation.actual_ended_at).toISOString()
          : null,
      },
      p_actual_products:
        confirmation.application_status === "non_realisee" ? [] : actual,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      confirmation.application_status === "non_realisee"
        ? "Non-réalisation enregistrée"
        : "Application confirmée et stock mis à jour",
    );
    setConfirming(null);
    load();
  };
  const recordEfficacy = async () => {
    if (!checking) return;
    setSaving(true);
    const { error } = await supabase.rpc("record_treatment_efficacy", {
      p_request: checking.id,
      p_check: {
        ...efficacy,
        checked_at: new Date(efficacy.checked_at).toISOString(),
      },
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contrôle d’efficacité enregistré");
    setChecking(null);
    setEfficacy({
      checked_at: "",
      efficacy_pct: "",
      infestation_before: "",
      infestation_after: "",
      reinfection_observed: false,
      corrective_action: "",
      observations: "",
    });
    load();
  };
  const pending = useMemo(
    () => requests.filter((x) => x.status === "soumise").length,
    [requests],
  );
  const stockSummary=useMemo(()=>{
    const groups=new Map<string,{name:string;total:number;available:number}>();
    requests.filter(r=>r.stock_forecast).forEach(r=>{
      const id=r.schedule_id||r.id;
      const value=groups.get(id)||{name:r.target_name,total:0,available:0};
      value.total++;if(r.stock_forecast.stock_status==="disponible")value.available++;
      groups.set(id,value);
    });
    return [...groups].filter(([,v])=>v.available<v.total);
  },[requests]);

  return (
    <div>
      <Link
        href="/agronomie"
        className="inline-flex items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary mb-2"
      >
        <ArrowLeft size={12} /> Journal agronomique
      </Link>
      <PageHeader
        title="Traitements phytosanitaires"
        subtitle="Prescription, validation et exécution"
        icon={ShieldCheck}
        iconColor="#ef4444"
        description={`${pending} demande${pending !== 1 ? "s" : ""} en attente · disponibilité prévisionnelle par occurrence`}
        actions={
          <Button onClick={() => {setForm({...blankRequest(),spray_volume_l_ha:String(defaultSprayVolumeLHa)});setRequestOpen(true)}}>
            <Plus size={14} /> Nouvelle prescription
          </Button>
        }
      />

      {requestOpen && (
        <Modal
          title="NOUVELLE PRESCRIPTION"
          onClose={() => setRequestOpen(false)}
          size="lg"
        >
          <div className="space-y-md">
            <Field label="Ferme" required>
              <Select
                value={form.farm_id}
                onChange={(e) =>
                  setForm((v) => ({
                    ...v,
                    farm_id: e.target.value,
                    warehouse_id: "",
                    target_planting_ids: [],
                    treated_area_m2: "",
                    water_volume_liters: "",
                    products: v.products.map((p: any) => ({
                      ...p,
                      planned_quantity: "",
                    })),
                  }))
                }
              >
                <option value="">Sélectionner une ferme</option>
                {Array.from(
                  new Map(
                    plantings.map((p: any) => [
                      p.greenhouses?.farms?.id,
                      p.greenhouses?.farms,
                    ]),
                  ).values(),
                )
                  .filter(Boolean)
                  .map((farm: any) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Entrepôt de prélèvement de la ferme" required>
              <Select disabled={!form.farm_id} value={form.warehouse_id} onChange={e=>setForm(v=>({...v,warehouse_id:e.target.value}))}>
                <option value="">Sélectionner un entrepôt</option>
                {warehouses.filter(w=>w.is_active&&w.farm_id===form.farm_id).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
              {form.farm_id&&!warehouses.some(w=>w.is_active&&w.farm_id===form.farm_id)&&<p className="text-warning">Aucun entrepôt actif rattaché à cette ferme. <Link href="/entrepots" className="underline">Gérer les entrepôts</Link></p>}
            </Field>
            <p className="text-caption text-fg-tertiary">Le stock est vérifié dans cet entrepôt uniquement. Une insuffisance n’empêche pas la planification ; elle sera signalée par occurrence.</p>
            <Field label="Serres / plantations concernées" required>
              <div className="rounded-md border border-border p-sm space-y-sm">
                <label className="flex gap-sm text-body-sm font-semibold">
                  <input
                    type="checkbox"
                    disabled={!form.farm_id}
                    checked={
                      Boolean(form.farm_id) &&
                      plantings
                        .filter(
                          (p: any) => p.greenhouses?.farm_id === form.farm_id,
                        )
                        .every((p: any) =>
                          form.target_planting_ids.includes(p.id),
                        )
                    }
                    onChange={(e) =>
                      setTargets(
                        e.target.checked
                          ? plantings
                              .filter(
                                (p: any) =>
                                  p.greenhouses?.farm_id === form.farm_id,
                              )
                              .map((p: any) => p.id)
                          : [],
                      )
                    }
                  />{" "}
                  Sélectionner toutes les serres
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs">
                  {plantings
                    .filter((p: any) => p.greenhouses?.farm_id === form.farm_id)
                    .map((p: any) => (
                      <label key={p.id} className="flex gap-sm text-body-sm">
                        <input
                          type="checkbox"
                          checked={form.target_planting_ids.includes(p.id)}
                          onChange={(e) =>
                            setTargets(
                              e.target.checked
                                ? [...form.target_planting_ids, p.id]
                                : form.target_planting_ids.filter(
                                    (id) => id !== p.id,
                                  ),
                            )
                          }
                        />
                        {p.greenhouses?.name} · {p.varieties?.commercial_name} ·{" "}
                        {Number(
                          p.planted_area ||
                            p.greenhouses?.exploitable_area ||
                            0,
                        ).toLocaleString("fr-FR")}{" "}
                        m²
                      </label>
                    ))}
                </div>
              </div>
            </Field>
            <div className="rounded-md border border-border p-md space-y-sm">
              <Field
                label={
                  <span>
                    Mode de planification
                    <FieldHelp text="Date unique pour une intervention, dates précises pour un calendrier libre, ou fréquence pour générer automatiquement plusieurs occurrences." />
                  </span>
                }
              >
                <Select
                  value={form.schedule_mode}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, schedule_mode: e.target.value }))
                  }
                >
                  <option value="single">Une seule date</option>
                  <option value="exact_dates">Plusieurs dates précises</option>
                  <option value="recurring">Fréquence définie</option>
                </Select>
              </Field>
              {form.schedule_mode !== "recurring" ? (
                <div className="space-y-xs">
                  {(form.schedule_mode === 'single' ? form.exact_dates.slice(0, 1) : form.exact_dates).map((date, index) => (
                    <div key={index} className="flex gap-xs">
                      <Input
                        type="datetime-local"
                        value={date}
                        {...dateFieldProps(`date_${index}`)}
                        onChange={(e) =>
                          setForm((v) => ({
                            ...v,
                            exact_dates: v.exact_dates.map((x, i) =>
                              i === index ? e.target.value : x,
                            ),
                          }))
                        }
                      />
                      {form.schedule_mode === "exact_dates" &&
                        form.exact_dates.length > 1 && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() =>
                              setForm((v) => ({
                                ...v,
                                exact_dates: v.exact_dates.filter(
                                  (_, i) => i !== index,
                                ),
                              }))
                            }
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                    </div>
                  ))}
                  {form.schedule_mode === "exact_dates" && (
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={() =>
                        setForm((v) => ({
                          ...v,
                          exact_dates: [...v.exact_dates, ""],
                        }))
                      }
                    >
                      <Plus size={11} /> Ajouter une date
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-md">
                  <Field label="Première date" required>
                    <Input
                      type="datetime-local"
                      value={form.starts_at}
                      {...dateFieldProps('starts_at')}
                      onChange={(e) =>
                        setForm((v) => ({ ...v, starts_at: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Fréquence">
                    <Select
                      value={form.frequency}
                      onChange={(e) =>
                        setForm((v) => ({ ...v, frequency: e.target.value }))
                      }
                    >
                      <option value="daily">Journalière</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="monthly">Mensuelle</option>
                      <option value="quarterly">Trimestrielle</option>
                      <option value="yearly">Annuelle</option>
                    </Select>
                  </Field>
                  <Field
                    label={
                      <span>
                        Intervalle
                        <FieldHelp text="Exemple : 2 avec une fréquence hebdomadaire signifie une occurrence toutes les deux semaines." />
                      </span>
                    }
                  >
                    <Input
                      type="number"
                      min="1"
                      value={form.interval_value}
                      onChange={(e) =>
                        setForm((v) => ({
                          ...v,
                          interval_value: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Date de fin">
                    <Input
                      type="datetime-local"
                      value={form.ends_at}
                      {...dateFieldProps('ends_at')}
                      onChange={(e) =>
                        setForm((v) => ({ ...v, ends_at: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Nombre d’occurrences">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={form.occurrence_count}
                      onChange={(e) =>
                        setForm((v) => ({
                          ...v,
                          occurrence_count: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
            {datesAttempted && Object.keys(dateValidation.errors).length>0 && <div role="alert" className="text-danger text-caption">{Object.entries(dateValidation.errors).map(([key,message])=><p key={key}>{key.startsWith('date_')?`Date ${Number(key.slice(5))+1}`:key==='starts_at'?'Première date':key==='ends_at'?'Date de fin':'Planification'} : {message}</p>)}</div>}
            <div className="grid grid-cols-2 gap-md">
              <Field
                label={
                  <span>
                    Surface totale calculée (m²)
                    <FieldHelp text="Somme des surfaces plantées des serres sélectionnées." />
                  </span>
                }
                required
              >
                <Input type="number" value={form.treated_area_m2} disabled />
              </Field>
              <Field
                label={
                  <span>
                    Cible biologique
                    <FieldHelp text="Ravageur, maladie ou problème observé, par exemple Tuta absoluta, aleurode ou botrytis." />
                  </span>
                }
                required
              >
                <Select
                  value={form.target_name}
                  onChange={(e) =>
                    chooseTarget(e.target.value)
                  }
                ><option value="">Sélectionner une cible</option>{targetOptions.map(target=><option key={target} value={target}>{target}</option>)}<option value="__other__">Autre cible / non identifiée</option></Select>
              </Field>
            </div>
            {form.target_name === "__other__" && <Field label="Autre cible" required><Input value={form.custom_target} onChange={e=>setForm(v=>({...v,custom_target:e.target.value,products:[emptyProduct()]}))}/></Field>}
            <div className="grid grid-cols-2 gap-md">
              <Field label={<span>Volume de bouillie estimé (L/ha)<FieldHelp text="Valeur de référence du produit ou, à défaut, valeur paramétrée pour le client. Toute modification recalcule le volume global et les quantités prévues." /></span>}>
                <Input type="text" value={form.spray_volume_l_ha} onChange={(e)=>setForm((v)=>{const perHa=parseLocalizedNumber(e.target.value),area=parseLocalizedNumber(v.treated_area_m2),water=area&&perHa?Math.round(((area*perHa)/10000)*100)/100:0;return{...v,spray_volume_l_ha:e.target.value,water_volume_liters:water?String(water):'',products:recalcLines(v.products,area,water)}})}/>
              </Field>
              <Field label={<span>Volume global calculé (L)<FieldHelp text="Surface totale sélectionnée × volume de bouillie par hectare." /></span>}>
                <Input type="text" value={form.water_volume_liters} disabled />
              </Field>
            </div>
            <Field
              label={
                <span>
                  Diagnostic
                  <FieldHelp text="Décris les symptômes, le niveau d’infestation, les zones touchées et les observations réalisées sur le terrain." />
                </span>
              }
              required
            >
              <Textarea
                rows={2}
                value={form.diagnosis}
                onChange={(e) =>
                  setForm((v) => ({ ...v, diagnosis: e.target.value }))
                }
              />
            </Field>
            <Field
              label={
                <span>
                  Justification agronomique
                  <FieldHelp text="Explique pourquoi le traitement est nécessaire et le résultat recherché." />
                </span>
              }
              required
            >
              <Textarea
                rows={2}
                value={form.justification}
                onChange={(e) =>
                  setForm((v) => ({ ...v, justification: e.target.value }))
                }
              />
            </Field>
            <div className="flex justify-between items-center">
              <div className="font-mono text-caption uppercase text-fg-tertiary">
                Produits prévus
              </div>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() =>
                  setForm((v) => ({
                    ...v,
                    products: [...v.products, emptyProduct()],
                  }))
                }
              >
                <Plus size={11} /> Produit
              </Button>
            </div>
            {productLoadError&&<p className="text-danger">Chargement des produits impossible : {productLoadError}</p>}
            <p className="text-caption text-warning">La planification est possible sans stock. Les articles manquants et les ruptures seront signalés par occurrence. Le stock et la conformité réglementaire restent obligatoires avant l’application réelle.</p>
            {form.target_name && form.target_name !== "__other__" && !productLoadError && (
              <div className="rounded-md border border-border p-sm space-y-1">
                <p className="text-caption">Choisissez les produits à utiliser parmi ceux liés à la cible. Utilisez « + Produit » pour en ajouter. Changer de cible réinitialise les produits sélectionnés.</p>
              </div>
            )}
            {form.target_name && form.target_name !== "__other__" && !productLoadError && productsForTarget(form.target_name).length===0 && (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-md py-sm text-body-sm text-warning">
                {hasActiveStationList?"Aucun produit validé de la liste Station active n’est lié à cette cible. Vérifiez les associations dans les listes positives.":"Aucune liste Station active : aucun usage autorisé actif ne correspond à cette cible. Vérifiez les usages ou activez la liste positive validée."}
              </div>
            )}
            {form.products.map((line: any, index: number) => {
              const selected = products.find(
                  (p: any) => line.catalog_product_id?p.catalog_product_id===line.catalog_product_id:!!line.stock_item_id&&p.stock_item_id === line.stock_item_id,
                ),
                use = getAuthorizedUse(selected, currentTargetName(form)),
                unit = doseUnits.find((x) => x.code === line.dose_unit);
              return (
                <div
                  key={index}
                  className="rounded-md border border-border p-sm space-y-sm"
                >
                  <div className="grid grid-cols-[1fr_auto] gap-sm">
                    <Field label={`Produit ${index + 1}${selected ? " — "+selected.name : ""}`} required>
                      {selected&&productUnavailableReason(selected,currentTargetName(form))&&<p className="text-warning text-caption">{productUnavailableReason(selected,currentTargetName(form))}</p>}
                      <Select
                        value={line.catalog_product_id || selected?.catalog_product_id || ""}
                        onChange={(e) => chooseProduct(index, e.target.value)}
                      >
                        <option value="">Sélectionner un produit lié à la cible</option>
                        {(currentTargetName(form) ? productsForTarget(currentTargetName(form)) : []).map((p: any) => (
                          <option
                            key={p.catalog_product_id}
                            value={p.catalog_product_id}
                            disabled={!!productLoadError||!p.is_active||!getAuthorizedUse(p,currentTargetName(form))}
                          >
                            {p.name} —{" "}
                            {p.stock_item_id
                              ? `article lié · unité ${p.unit}`
                              : "à lier au stock"}
                            {hasStationCompliance(p,currentTargetName(form)) ? " — Validé par la station" : p.authorization_status !== "autorise"
                              ? ` — ${p.authorization_status}`
                              : ""}
                            {productUnavailableReason(p,currentTargetName(form))?` — ${productUnavailableReason(p,currentTargetName(form))}`:""}
                          </option>
                        ))}
                      </Select>
                      {selected&&!selected.stock_item_id&&<><Link href="/stocks/preparation-phyto" target="_blank" rel="noopener noreferrer" className="text-caption underline">Préparer l’article de stock</Link><p className="text-caption">Sans article lié, la quantité est estimée dans l’unité du produit indiquée ci-dessous.</p></>}
                    </Field>
                    {form.products.length > 1 && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          setForm((v) => ({
                            ...v,
                            products: v.products.filter(
                              (_: any, i: number) => i !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-sm">
                    <Field
                      label={
                        <span>
                          Dose{" "}
                          {use &&
                            `(${use.dose_min ?? use.dose_max}–${use.dose_max})`}
                          <FieldHelp text="Préremplie avec la dose minimale. La soumission est bloquée hors de l’intervalle autorisé." />
                        </span>
                      }
                      required
                    >
                      <Input
                        type="number"
                        step="any"
                        min={use?.dose_min ?? undefined}
                        max={use?.dose_max ?? undefined}
                        value={line.dose}
                        onChange={(e) =>
                          setForm((v) => {
                            const lines = v.products.map(
                              (old: any, i: number) =>
                                i === index
                                  ? {
                                      ...old,
                                      dose: e.target.value,
                                      calculated_quantity: plannedQuantity(
                                        e.target.value,
                                        old.dose_unit,
                                        v.treated_area_m2,
                                        v.water_volume_liters,
                                        selected?.unit || "",
                                      ),
                                      planned_quantity: old.quantity_is_manual
                                        ? old.planned_quantity
                                        : plannedQuantity(
                                            e.target.value,
                                            old.dose_unit,
                                            v.treated_area_m2,
                                            v.water_volume_liters,
                                            selected?.unit || "",
                                          ),
                                    }
                                  : old,
                            );
                            return { ...v, products: lines };
                          })
                        }
                      />
                    </Field>
                    <Field label="Unité de dose">
                      <Input value={unit?.label || line.dose_unit} disabled />
                    </Field>
                    <Field
                      label={
                        <span>
                          Quantité prévue {selected?.unit||normalizeDoseUnit(line.dose_unit).split("_")[0]? "("+(selected?.unit||normalizeDoseUnit(line.dose_unit).split("_")[0])+")":""}
                          <FieldHelp
                            text="Dose par surface : dose × surface en hectares. Dose par 100 L : dose × volume global de bouillie / 100. Conversion vers l’unité de stock si elle est connue."
                          />
                        </span>
                      }
                      required
                    >
                      <Input
                        type="text"
                        step="any"
                        value={line.quantity_is_manual ? line.planned_quantity : formatQuantity(line.planned_quantity)}
                        inputMode="decimal"
                        disabled={!line.quantity_is_manual}
                        onChange={(e) =>
                          changeProduct(
                            index,
                            "planned_quantity",
                            e.target.value,
                          )
                        }
                      />
                      {!line.planned_quantity&&!line.quantity_is_manual&&<p className="text-warning text-caption">
                        {!parseLocalizedNumber(line.dose)?"Renseigner une dose positive.":!line.dose_unit?"L’unité de dose manque dans l’usage du produit.":!parseLocalizedNumber(form.treated_area_m2)?"Sélectionner les serres pour calculer la surface.":["ml_100l","g_100l"].includes(normalizeDoseUnit(line.dose_unit))&&!parseLocalizedNumber(form.water_volume_liters)?"Renseigner le volume global de bouillie.":"Unité non reconnue ou incompatible : "+line.dose_unit+" / "+(selected?.unit||"sans article de stock")+". "}
                      </p>}
                    </Field>
                  </div>
                  <label className="flex items-center gap-sm text-caption">
                    <input
                      type="checkbox"
                      checked={line.quantity_is_manual}
                      onChange={(e) =>
                        setForm((v) => ({
                          ...v,
                          products: v.products.map((old: any, i: number) =>
                            i === index
                              ? {
                                  ...old,
                                  quantity_is_manual: e.target.checked,
                                  planned_quantity: e.target.checked
                                    ? old.planned_quantity ||
                                      old.calculated_quantity
                                    : old.calculated_quantity,
                                  quantity_override_justification:
                                    e.target.checked
                                      ? old.quantity_override_justification
                                      : "",
                                }
                              : old,
                          ),
                        }))
                      }
                    />
                    Modifier manuellement la quantité prévue
                  </label>
                  {line.quantity_is_manual && (
                    <Field
                      label={
                        <span>
                          Justification de la quantité manuelle
                          <FieldHelp text="Explique l’écart avec la quantité calculée : réglage du matériel, concentration, conditionnement ou prescription particulière." />
                        </span>
                      }
                      required
                    >
                      <Textarea
                        rows={2}
                        value={line.quantity_override_justification}
                        onChange={(e) =>
                          changeProduct(
                            index,
                            "quantity_override_justification",
                            e.target.value,
                          )
                        }
                      />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-sm">
                    <Field
                      label={
                        <span>
                          DAR (jours)
                          <FieldHelp text="Délai minimal entre l’application et la récolte, hérité de l’usage autorisé." />
                        </span>
                      }
                    >
                      <Input type="number" value={line.phi_days} disabled />
                    </Field>
                    <Field
                      label={
                        <span>
                          Délai rentrée (h)
                          <FieldHelp text="Durée minimale avant le retour des travailleurs dans la serre traitée, héritée de l’usage autorisé." />
                        </span>
                      }
                    >
                      <Input type="number" value={line.rei_hours} disabled />
                    </Field>
                  </div>
                  <label className="flex gap-sm text-caption">
                    <input
                      type="checkbox"
                      checked={line.label_confirmed}
                      onChange={(e) =>
                        changeProduct(
                          index,
                          "label_confirmed",
                          e.target.checked,
                        )
                      }
                    />{" "}
                    Usage, dose, DAR et délai de rentrée vérifiés sur
                    l’étiquette.
                  </label>
                </div>
              );
            })}
            <ModalFooter
              onCancel={() => setRequestOpen(false)}
              onSave={submit}
              loading={saving}
              saveLabel="SOUMETTRE À VALIDATION"
            />
          </div>
        </Modal>
      )}

      {confirming && (
        <Modal
          title="CONFIRMER L’APPLICATION RÉELLE"
          onClose={() => setConfirming(null)}
          size="lg"
        >
          <div className="space-y-md">
            <div className="grid grid-cols-2 gap-md">
              <Field label="Résultat">
                <Select
                  value={confirmation.application_status}
                  onChange={(e) =>
                    setConfirmation((v: any) => ({
                      ...v,
                      application_status: e.target.value,
                    }))
                  }
                >
                  <option value="realisee">Réalisée</option>
                  <option value="partielle">Partiellement réalisée</option>
                  <option value="non_realisee">Non réalisée</option>
                </Select>
              </Field>
              {confirmation.application_status !== "non_realisee" && (
                <Field label="Applicateur" required>
                  {!requireReentryDelay&&<p role="alert" className="text-warning">Contrôle du délai de rentrée désactivé pour ce client : un délai absent restera signalé dans l’historique. Cela n’autorise pas la rentrée dans la serre.</p>}
                  {workerLoadError ? <p role="alert" className="text-danger">Chargement des employés impossible : {workerLoadError}</p> : !workers.length && <p className="text-warning">Aucun employé actif rattaché à ce client. Vérifiez la ferme dans sa fiche RH, puis actualisez la page.</p>}
                  <Select
                    value={confirmation.applicator_worker_id}
                    onChange={(e) =>
                      setConfirmation((v: any) => ({
                        ...v,
                        applicator_worker_id: e.target.value,
                      }))
                    }
                  >
                    <option value="">Sélectionner</option>
                    {workers.map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {w.last_name} {w.first_name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            {confirmation.application_status === "non_realisee" ? (
              <Field label="Motif obligatoire">
                <Textarea
                  value={confirmation.non_execution_reason}
                  onChange={(e) =>
                    setConfirmation((v: any) => ({
                      ...v,
                      non_execution_reason: e.target.value,
                    }))
                  }
                />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-md">
                  <Field label="Début réel">
                    <Input
                      type="datetime-local"
                      value={confirmation.actual_started_at}
                      onChange={(e) =>
                        setConfirmation((v: any) => ({
                          ...v,
                          actual_started_at: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Fin réelle">
                    <Input
                      type="datetime-local"
                      value={confirmation.actual_ended_at}
                      onChange={(e) =>
                        setConfirmation((v: any) => ({
                          ...v,
                          actual_ended_at: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                  <Field label={<span>Surface réellement traitée (m²)<FieldHelp text="Surface effectivement couverte le jour de l’application." /></span>} required>
                    <Input type="text" value={confirmation.actual_treated_area_m2} onChange={(e)=>updateActualVolumes("area",e.target.value)} />
                  </Field>
                  <Field label={<span>Volume réel (L/ha)<FieldHelp text="Valeur terrain. Modifier ce champ recalcule le volume total et les quantités de produits." /></span>} required>
                    <Input type="text" value={confirmation.actual_spray_volume_l_ha} onChange={(e)=>updateActualVolumes("perHa",e.target.value)} />
                  </Field>
                  <Field label={<span>Bouillie réellement préparée (L)<FieldHelp text="Peut être saisi directement ; le ratio L/ha et les consommations sont alors recalculés." /></span>} required>
                    <Input type="text" value={confirmation.actual_water_volume_liters} onChange={(e)=>updateActualVolumes("total",e.target.value)} />
                  </Field>
                </div>
                <div className="rounded border p-3 space-y-2">
                  <label className="flex gap-2"><input type="checkbox" checked={Boolean(confirmation.homogeneous_cost_allocation)} onChange={e => setConfirmation((v:any) => ({...v, homogeneous_cost_allocation:e.target.checked}))} />Application homogène : répartir les quantités et coûts au prorata des surfaces prescrites.</label>
                  {!confirmation.homogeneous_cost_allocation && (confirming.treatment_request_targets || []).map((t:any) => <Field key={t.id} label={`Surface réellement traitée — ${t.campaign_plantings?.greenhouses?.name || t.campaign_planting_id}`} required><Input type="text" value={confirmation.actual_cost_areas?.[t.campaign_planting_id] ?? ''} onChange={e => setConfirmation((v:any) => ({...v, actual_cost_areas:{...v.actual_cost_areas,[t.campaign_planting_id]:e.target.value}}))} /></Field>)}
                  <p className="text-xs">Vérifiez les surfaces réelles. Leur somme doit correspondre à la surface totale réellement traitée. Une surface nulle n’impute aucun coût à cette serre.</p>
                </div>
                {confirming.treatment_request_products.map((p: any) => (
                  <Card key={p.id} padding="sm">
                    <Field label={`Quantité réelle calculée — ${p.stock_items?.name || p.product_name} (${p.stock_items?.unit || p.quantity_unit})`}>
                      <Input type="text" value={confirmation.actual_products[p.id] || ""} disabled={!confirmation.actual_product_overrides[p.id]} onChange={(e)=>setConfirmation((v:any)=>({...v,actual_products:{...v.actual_products,[p.id]:e.target.value}}))}/>
                    </Field>
                    <label className="flex items-center gap-xs mt-sm text-body-sm"><input type="checkbox" checked={Boolean(confirmation.actual_product_overrides[p.id])} onChange={(e)=>setConfirmation((v:any)=>{const overrides={...v.actual_product_overrides,[p.id]:e.target.checked};const next={...v,actual_product_overrides:overrides};return {...next,actual_products:calculatedActualProducts(confirming,next,v.actual_treated_area_m2,v.actual_water_volume_liters)}})}/> Modifier manuellement la quantité réelle</label>
                    {confirmation.actual_product_overrides[p.id]&&<Field label="Justification obligatoire" className="mt-sm"><Textarea value={confirmation.actual_product_justifications[p.id]||""} onChange={(e)=>setConfirmation((v:any)=>({...v,actual_product_justifications:{...v.actual_product_justifications,[p.id]:e.target.value}}))}/></Field>}
                    <div className="text-caption text-fg-tertiary mt-xs">Prévu : {formatQuantity(p.planned_quantity)} {p.stock_items?.unit || p.quantity_unit} · Dose : {formatQuantity(p.dose)} {p.dose_unit}{!p.stock_item_id&&" — Rattacher un article de stock avant de confirmer l’application."}</div>
                  </Card>
                ))}
                <Field label="Écarts par rapport à la prescription">
                  <Textarea
                    value={confirmation.deviation_notes}
                    onChange={(e) =>
                      setConfirmation((v: any) => ({
                        ...v,
                        deviation_notes: e.target.value,
                      }))
                    }
                  />
                </Field>
              </>
            )}
            <ModalFooter
              onCancel={() => setConfirming(null)}
              onSave={confirmApplication}
              loading={saving}
              saveLabel="CONFIRMER"
            />
          </div>
        </Modal>
      )}

      {checking && (
        <Modal
          title="CONTRÔLE D’EFFICACITÉ"
          onClose={() => setChecking(null)}
          size="md"
        >
          <div className="space-y-md">
            <div className="grid grid-cols-2 gap-md">
              <Field label="Date du contrôle">
                <Input
                  type="datetime-local"
                  value={efficacy.checked_at}
                  onChange={(e) =>
                    setEfficacy((v: any) => ({
                      ...v,
                      checked_at: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Efficacité estimée (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={efficacy.efficacy_pct}
                  onChange={(e) =>
                    setEfficacy((v: any) => ({
                      ...v,
                      efficacy_pct: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-md">
              <Field label="Infestation avant">
                <Input
                  value={efficacy.infestation_before}
                  onChange={(e) =>
                    setEfficacy((v: any) => ({
                      ...v,
                      infestation_before: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Infestation après">
                <Input
                  value={efficacy.infestation_after}
                  onChange={(e) =>
                    setEfficacy((v: any) => ({
                      ...v,
                      infestation_after: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <label className="flex gap-sm text-body-sm">
              <input
                type="checkbox"
                checked={efficacy.reinfection_observed}
                onChange={(e) =>
                  setEfficacy((v: any) => ({
                    ...v,
                    reinfection_observed: e.target.checked,
                  }))
                }
              />{" "}
              Réinfection observée
            </label>
            <Field label="Action corrective">
              <Textarea
                value={efficacy.corrective_action}
                onChange={(e) =>
                  setEfficacy((v: any) => ({
                    ...v,
                    corrective_action: e.target.value,
                  }))
                }
              />
            </Field>
            <ModalFooter
              onCancel={() => setChecking(null)}
              onSave={recordEfficacy}
              loading={saving}
              disabled={!efficacy.checked_at}
              saveLabel="ENREGISTRER"
            />
          </div>
        </Modal>
      )}

      <div className="my-md"><Button variant="ghost" onClick={load}>Actualiser la disponibilité</Button>
        {forecastError&&<p className="text-warning">Disponibilité non calculée : {forecastError}</p>}
        {stockSummary.map(([id,s])=><p key={id} className="text-warning">{s.name} : {s.available}/{s.total} occurrences à venir couvertes ; {s.total-s.available} à approvisionner.</p>)}
      </div>
      <Card padding="none" className="overflow-hidden">
        <DataTable minWidth={1150}>
          <THead>
            <TR>
              <TH>Date prévue</TH>
              <TH>Serres</TH>
              <TH>Cible</TH>
              <TH>Produits prévus</TH>
              <TH>Demandeur</TH>
              <TH>Statut</TH>
              <TH right>Actions</TH>
            </TR>
          </THead>
          <tbody>
            {requests.map((r) => {
              const st = STATUS[r.status] || STATUS.annulee;
              return (
                <TR key={r.id}>
                  <TD>
                    <DateDisplay value={r.planned_at} />
                    {r.occurrence_number&&<div className="text-caption">Occurrence {r.occurrence_number}</div>}
                    <div className="text-caption">{warehouses.find(w=>w.id===r.warehouse_id)?.name||"Entrepôt non renseigné"}</div>
                  </TD>
                  <TD>
                    {(r.treatment_request_targets || []).map((t: any) => (
                      <div key={t.id}>
                        {t.campaign_plantings?.greenhouses?.name || "—"}
                      </div>
                    ))}
                  </TD>
                  <TD>{r.target_name}</TD>
                  <TD>
                    {(r.treatment_request_products || []).map((p: any) => (
                      <div key={p.id}>
                        {p.stock_items?.name || p.product_name} · {formatQuantity(p.planned_quantity)}{" "}
                        {p.stock_items?.unit || p.quantity_unit}
                        {!p.stock_item_id&&<span className="text-warning"> · Article de stock à créer</span>}
                      </div>
                    ))}
                  </TD>
                  <TD mono className="text-caption">
                    {r.requested_by === user?.id
                      ? "Moi"
                      : r.requested_by.slice(0, 8)}
                  </TD>
                  <TD>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    {(Array.isArray(r.treatment_applications) ? r.treatment_applications : r.treatment_applications ? [r.treatment_applications] : []).flatMap((a:any)=>Array.isArray(a?.safety_warnings)?a.safety_warnings:[]).filter((warning:any)=>warning&&typeof warning.message==='string').map((warning:any,index:number)=><p key={index} className="text-warning text-caption">{typeof warning.product==='string'?warning.product:'Produit'} : {warning.message}</p>)}
                    {r.stock_forecast&&<div className="mt-1">
                      <Badge variant={r.stock_forecast.stock_status==="disponible"?"success":"warning"}>
                        {r.stock_forecast.stock_status==="disponible"?"Stock disponible":r.stock_forecast.stock_status==="partiel"?"Stock partiellement disponible":"Stock non disponible"}
                      </Badge>
                      {(r.stock_forecast.shortages||[]).map((s:any)=><div key={s.stock_item_id||s.catalog_product_id} className="text-caption text-warning">{s.product} : {s.article_missing?"article à créer — ":""}manque {formatQuantity(s.missing)} {s.unit}</div>)}
                    </div>}
                  </TD>
                  <TD right>
                    <div className="flex justify-end gap-xs">
                      {["soumise","approuvee"].includes(r.status)&&(r.treatment_request_products||[]).some((p:any)=>!p.stock_item_id)&&<Button size="xs" variant="secondary" onClick={()=>resolveStock(r.id)}>Rattacher les articles créés</Button>}
                      {r.status === "soumise" &&
                        canValidate &&
                        r.requested_by !== user?.id && (
                          <>
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => review(r.id, true)}
                            >
                              <Check size={12} /> Valider
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => review(r.id, false)}
                            >
                              <X size={12} /> Rejeter
                            </Button>
                          </>
                        )}
                      {r.status === "approuvee" && canConfirm && (
                        <Button size="xs" onClick={() => openConfirmation(r)}>
                          <ClipboardCheck size={12} /> Confirmer
                        </Button>
                      )}
                      {r.status === "executee" && canConfirm && (
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => setChecking(r)}
                        >
                          <FlaskConical size={12} /> Efficacité
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </DataTable>
        {requests.length === 0 && (
          <EmptyState
            icon={FlaskConical}
            title="Aucun traitement"
            description="Crée une prescription qui sera validée par une autre personne habilitée."
          />
        )}
      </Card>
    </div>
  );
}
