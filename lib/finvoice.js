"use strict";
// Finvoice 3.0 e-invoice (verkkolasku) for an invoice. Finnish e-invoicing operators (Maventa, Apix, Netvisor, …)
// accept this file as is; sending it through an operator is a separate step once the company has chosen one.
const round2 = (x) => Math.round(x * 100) / 100;
const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amt = (n) => round2(Number(n) || 0).toFixed(2).replace(".", ",");
const ymd = (iso) => String(iso || "").slice(0, 10).replace(/-/g, "");
const el = (name, value, attrs = "") => (value === undefined || value === null || value === "" ? "" : `<${name}${attrs}>${esc(value)}</${name}>`);

/** Finnish business ID 1234567-8 → OVT-like party identifier "0037" + 12345678 (used when no e-invoice address is given). */
const ovtFromBusinessId = (bid) => {
  const d = String(bid || "").replace(/\D/g, "");
  return d.length === 8 ? `0037${d}` : "";
};

/** Splits "Street 1, 00100 City" into street / postcode / town as well as possible. */
function splitAddress(a) {
  const s = String(a || "").trim();
  const m = /^(.*?),?\s*(\d{5})\s+([^,]+)$/.exec(s);
  if (m) return { street: m[1].replace(/,\s*$/, "").trim(), code: m[2], town: m[3].trim() };
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return { street: parts[0] || s, code: "", town: parts.slice(1).join(", ") };
}

/**
 * @param iv invoice record (lib/platform buildInvoice)
 * @param o the order (for site, PO, project)
 * @param account business customer account (e-invoice address and operator)
 * @param company seller details from settings
 */
function finvoice(iv, o, account, company) {
  const seller = company || {};
  const buyer = iv.customer || {};
  const sAddr = splitAddress(seller.address);
  const bAddr = splitAddress((account && account.billingAddress) || (o && o.site && o.site.address) || iv.site);
  const biz = (o && o.business) || {};
  const sellerOvt = ovtFromBusinessId(seller.businessId);
  const buyerOvt = (account && account.einvoiceAddress) || ovtFromBusinessId(buyer.businessId);
  const now = new Date().toISOString();
  const vatPct = Number(iv.vatPct) || 25.5;
  const rows = (iv.lines || []).map((l) => {
    const qty = Number(l.qty) || 1;
    const net = round2(Number(l.net) || 0);
    const vat = round2((net * vatPct) / 100);
    return `
  <InvoiceRow>
    ${el("ArticleName", l.text || l.label)}
    <DeliveredQuantity QuantityUnitCode="${esc(l.unit || "kpl")}">${amt(qty)}</DeliveredQuantity>
    <UnitPriceAmount AmountCurrencyIdentifier="EUR">${amt(l.unitPrice)}</UnitPriceAmount>
    <RowVatRatePercent>${amt(vatPct)}</RowVatRatePercent>
    <RowVatAmount AmountCurrencyIdentifier="EUR">${amt(vat)}</RowVatAmount>
    <RowVatExcludedAmount AmountCurrencyIdentifier="EUR">${amt(net)}</RowVatExcludedAmount>
    <RowAmount AmountCurrencyIdentifier="EUR">${amt(net + vat)}</RowAmount>
  </InvoiceRow>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Finvoice Version="3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Finvoice3.0.xsd">
  <MessageTransmissionDetails>
    <MessageSenderDetails>
      ${el("FromIdentifier", String(seller.einvoiceAddress || sellerOvt).replace(/\s/g, ""))}
      ${el("FromIntermediator", seller.einvoiceOperator)}
    </MessageSenderDetails>
    <MessageReceiverDetails>
      ${el("ToIdentifier", buyerOvt)}
      ${el("ToIntermediator", account && account.einvoiceOperator)}
    </MessageReceiverDetails>
    <MessageDetails>
      <MessageIdentifier>${esc(`TK-INV-${iv.no}`)}</MessageIdentifier>
      <MessageTimeStamp>${esc(now.slice(0, 19))}</MessageTimeStamp>
    </MessageDetails>
  </MessageTransmissionDetails>
  <SellerPartyDetails>
    ${el("SellerPartyIdentifier", seller.businessId)}
    <SellerOrganisationName>${esc(seller.name || "TelineKiito")}</SellerOrganisationName>
    ${el("SellerOrganisationTaxCode", seller.businessId ? `FI${String(seller.businessId).replace(/\D/g, "")}` : "")}
    <SellerPostalAddressDetails>
      ${el("SellerStreetName", sAddr.street)}
      ${el("SellerTownName", sAddr.town)}
      ${el("SellerPostCodeIdentifier", sAddr.code)}
      <CountryCode>FI</CountryCode>
    </SellerPostalAddressDetails>
  </SellerPartyDetails>
  ${el("SellerOrganisationUnitNumber", sellerOvt)}
  <SellerInformationDetails>
    ${el("SellerPhoneNumber", seller.phone)}
    ${el("SellerCommonEmailaddressIdentifier", seller.email)}
    <SellerAccountDetails>
      <SellerAccountID IdentificationSchemeName="IBAN">${esc(String(seller.iban || "").replace(/\s/g, ""))}</SellerAccountID>
      <SellerBic IdentificationSchemeName="BIC">${esc(seller.bic || "")}</SellerBic>
    </SellerAccountDetails>
  </SellerInformationDetails>
  <BuyerPartyDetails>
    ${el("BuyerPartyIdentifier", buyer.businessId)}
    <BuyerOrganisationName>${esc(buyer.name)}</BuyerOrganisationName>
    <BuyerPostalAddressDetails>
      ${el("BuyerStreetName", bAddr.street)}
      ${el("BuyerTownName", bAddr.town)}
      ${el("BuyerPostCodeIdentifier", bAddr.code)}
      <CountryCode>FI</CountryCode>
    </BuyerPostalAddressDetails>
  </BuyerPartyDetails>
  ${el("BuyerOrganisationUnitNumber", buyerOvt)}
  ${el("BuyerContactPersonName", buyer.contact)}
  <BuyerCommunicationDetails>
    ${el("BuyerPhoneNumberIdentifier", buyer.phone)}
    ${el("BuyerEmailaddressIdentifier", buyer.email)}
  </BuyerCommunicationDetails>
  <DeliveryPartyDetails>
    <DeliveryOrganisationName>${esc(buyer.name)}</DeliveryOrganisationName>
    <DeliveryPostalAddressDetails>
      ${el("DeliveryStreetName", splitAddress(iv.site).street)}
      ${el("DeliveryTownName", splitAddress(iv.site).town)}
      ${el("DeliveryPostCodeIdentifier", splitAddress(iv.site).code)}
      <CountryCode>FI</CountryCode>
    </DeliveryPostalAddressDetails>
  </DeliveryPartyDetails>
  <InvoiceDetails>
    <InvoiceTypeCode>INV01</InvoiceTypeCode>
    <InvoiceTypeText>LASKU</InvoiceTypeText>
    <OriginCode>Original</OriginCode>
    <InvoiceNumber>${esc(iv.no)}</InvoiceNumber>
    <InvoiceDate Format="CCYYMMDD">${ymd(iv.date)}</InvoiceDate>
    ${el("OrderIdentifier", biz.po)}
    ${el("AgreementIdentifier", iv.ref)}
    <InvoiceTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">${amt(iv.net)}</InvoiceTotalVatExcludedAmount>
    <InvoiceTotalVatAmount AmountCurrencyIdentifier="EUR">${amt(iv.vat)}</InvoiceTotalVatAmount>
    <InvoiceTotalVatIncludedAmount AmountCurrencyIdentifier="EUR">${amt(iv.total)}</InvoiceTotalVatIncludedAmount>
    <VatSpecificationDetails>
      <VatBaseAmount AmountCurrencyIdentifier="EUR">${amt(iv.net)}</VatBaseAmount>
      <VatRatePercent>${amt(vatPct)}</VatRatePercent>
      <VatRateAmount AmountCurrencyIdentifier="EUR">${amt(iv.vat)}</VatRateAmount>
    </VatSpecificationDetails>
    ${el("InvoiceFreeText", [biz.project && `Projekti: ${biz.project}`, biz.costCentre && `Kustannuspaikka: ${biz.costCentre}`, `Kohde: ${iv.site}`, `Tilaus ${iv.ref}`].filter(Boolean).join(" · "))}
    <PaymentTermsDetails>
      <InvoiceDueDate Format="CCYYMMDD">${ymd(iv.due)}</InvoiceDueDate>
    </PaymentTermsDetails>
  </InvoiceDetails>${rows}
  <EpiDetails>
    <EpiIdentificationDetails>
      <EpiDate Format="CCYYMMDD">${ymd(iv.date)}</EpiDate>
      <EpiReference>${esc(iv.reference)}</EpiReference>
    </EpiIdentificationDetails>
    <EpiPartyDetails>
      <EpiBfiPartyDetails>
        <EpiBfiIdentifier IdentificationSchemeName="BIC">${esc(seller.bic || "")}</EpiBfiIdentifier>
      </EpiBfiPartyDetails>
      <EpiBeneficiaryPartyDetails>
        <EpiNameAddressDetails>${esc(seller.name || "TelineKiito")}</EpiNameAddressDetails>
        <EpiAccountID IdentificationSchemeName="IBAN">${esc(String(seller.iban || "").replace(/\s/g, ""))}</EpiAccountID>
      </EpiBeneficiaryPartyDetails>
    </EpiPartyDetails>
    <EpiPaymentInstructionDetails>
      <EpiRemittanceInfoIdentifier IdentificationSchemeName="SPY">${esc(iv.reference)}</EpiRemittanceInfoIdentifier>
      <EpiInstructedAmount AmountCurrencyIdentifier="EUR">${amt(iv.total)}</EpiInstructedAmount>
      <EpiCharge ChargeOption="SLEV">SLEV</EpiCharge>
      <EpiDateOptionDate Format="CCYYMMDD">${ymd(iv.due)}</EpiDateOptionDate>
    </EpiPaymentInstructionDetails>
  </EpiDetails>
</Finvoice>
`.replace(/\n\s*\n/g, "\n");
}

module.exports = { finvoice, ovtFromBusinessId, splitAddress };
