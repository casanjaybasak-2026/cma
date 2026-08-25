-- ============================================================================
-- Upgrade: real bank document master catalog + per-application ad-hoc
-- checklist items.
--
-- document_master is a searchable reference catalog (354 real bank document
-- codes/names, grouped the way the bank's own master list groups them) that
-- staff can browse/search from the "Add Document" picker to attach any
-- additional relevant document to a SPECIFIC application — independent of
-- that application's default per-loan-category checklist.
--
-- document_requirements.application_id (nullable) distinguishes:
--   NULL         -> a template requirement, part of every application of
--                    that loan_category (the existing behaviour)
--   NOT NULL     -> an ad-hoc requirement added to exactly that one
--                    application via the Add Document picker
-- ============================================================================

create table document_master (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category_group text not null,
  document_category_id uuid not null references document_categories(id),
  priority text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index document_master_category_group_idx on document_master(category_group);
create index document_master_name_idx on document_master
  using gin (to_tsvector('simple', name || ' ' || code));

alter table document_master enable row level security;
create policy document_master_select on document_master for select to authenticated using (true);
create policy document_master_manage on document_master for all to authenticated
  using (can_manage_checklist()) with check (can_manage_checklist());

-- ----------------------------------------------------------------------------
-- Ad-hoc, per-application checklist items
-- ----------------------------------------------------------------------------
alter table document_requirements
  add column application_id uuid references loan_applications(id) on delete cascade,
  add column master_document_id uuid references document_master(id);

create index document_requirements_application_idx on document_requirements(application_id);

-- The original (loan_category_id, code) uniqueness only makes sense among
-- TEMPLATE rows (application_id is null) — the same master document code
-- must be addable as an ad-hoc item to many different applications, just
-- not twice to the *same* application.
alter table document_requirements drop constraint document_requirements_loan_category_id_code_key;
create unique index document_requirements_template_unique on document_requirements(loan_category_id, code)
  where application_id is null;
create unique index document_requirements_adhoc_unique on document_requirements(application_id, code)
  where application_id is not null;

-- Existing policies (document_requirements_select / _manage) already cover
-- template rows. Ad-hoc rows need their own insert path: any user who can
-- upload documents for an application can also extend its checklist.
create policy document_requirements_adhoc_insert on document_requirements for insert to authenticated
  with check (
    application_id is not null
    and auth_role() in ('admin', 'branch_manager', 'maker')
    and (is_admin() or application_branch(application_id) = auth_branch())
  );

create policy document_requirements_adhoc_delete on document_requirements for delete to authenticated
  using (
    application_id is not null
    and (is_admin() or (auth_role() = 'branch_manager' and application_branch(application_id) = auth_branch()))
  );

-- ----------------------------------------------------------------------------
-- application_completeness must count ad-hoc requirements for the specific
-- application they were added to, and template requirements for every
-- application of that loan category — never an ad-hoc item added to a
-- *different* application of the same loan category.
-- ----------------------------------------------------------------------------
create or replace view application_completeness
with (security_invoker = true) as
select
  la.id as application_id,
  count(dr.id) filter (where dr.required) as total_required,
  count(d.id) filter (where dr.required and d.id is not null) as uploaded_required,
  count(d.id) filter (where dr.required and d.status in ('verified', 'waived')) as verified_required,
  count(d.id) filter (where dr.required and d.status = 'rejected') as rejected_required,
  count(d.id) filter (where dr.required and d.status = 'replace_required') as replace_required_count,
  count(dr.id) filter (where dr.required and d.id is null) as missing_required
from loan_applications la
join document_requirements dr
  on dr.active = true
  and (
    (dr.application_id is null and dr.loan_category_id = la.loan_category_id)
    or dr.application_id = la.id
  )
left join lateral (
  select d2.*
  from documents d2
  where d2.application_id = la.id
    and d2.requirement_id = dr.id
    and d2.deleted_at is null
  order by d2.version desc
  limit 1
) d on true
group by la.id;
with mv(code, name, category_group, doc_cat_code, priority) as (
  values
  ('10','Income Proof','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('11','CIBIL Report','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('14','Credit Report of borrower/s','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('15','Credit Report of guarantor/s','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('158','Income Proof/ITR/Salary Slip/Form-16','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('159','ITR verification Report','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('166','Proof of employment and Salary Certificate for self and spouse','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('221','Photo','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('233','Aadhar Card','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('234','Employee ID Card','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('235','PAN Card','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('236','Passport','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('237','Last 6 Months Loan Account Statement','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('3','KYC-ID Proof','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('F182','Covering letter for forwarding Credit Information Report','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('F183','Credit Information Report (for Multiple Banking Arrangement)','Common KYC / Income / Credit','KYC','Core – normally assessed'),
  ('145','Original/Certified Land records','Home / Property','SECURITY','Review / Applicable'),
  ('146','Online verified copy of land records in case of agril. Advance','Home / Property','SECURITY','Review / Applicable'),
  ('149','Land Possession certificate','Home / Property','SECURITY','Review / Applicable'),
  ('161','Allotment Letter / Possession Letter / Demand Letter','Home / Property','SECURITY','Review / Applicable'),
  ('163','Original copy of sale deed','Home / Property','SECURITY','Review / Applicable'),
  ('167','Copy of approved layout','Home / Property','SECURITY','Review / Applicable'),
  ('168','Sale deed','Home / Property','SECURITY','Review / Applicable'),
  ('170','Property tax Receipt','Home / Property','SECURITY','Review / Applicable'),
  ('199','Land Conversion Certificate','Home / Property','SECURITY','Review / Applicable'),
  ('200','List of documents mortgaged with other Bank or FI','Home / Property','SECURITY','Review / Applicable'),
  ('250','Property Related Documents','Home / Property','SECURITY','Review / Applicable'),
  ('251','Title Deed','Home / Property','SECURITY','Review / Applicable'),
  ('41','Affidavit by borrower regarding details of land cultivated/crop grown in case of agril. advances','Home / Property','SECURITY','Review / Applicable'),
  ('D122','Special Power of Attorney (In favour of builders)','Home / Property','SECURITY','Review / Applicable'),
  ('D134','Letter of acknowledgement to be signed by third party for extension of equitable mortgage','Home / Property','SECURITY','Review / Applicable'),
  ('D134A','Letter of acknowledgement to be signed by third party for extension of equitable mortgage','Home / Property','SECURITY','Review / Applicable'),
  ('D136','Term Loan Agreement for Staff Housing Loan','Home / Property','SECURITY','Review / Applicable'),
  ('D140','Agreement of Hypothecation of Roof Top Solar Equipment','Home / Property','SECURITY','Review / Applicable'),
  ('D32','Letter from party to bank confirming the creation of equitable mortgage Original Title Deeds','Home / Property','SECURITY','Review / Applicable'),
  ('D67','Mortgage deed','Home / Property','SECURITY','Review / Applicable'),
  ('F137','Affidavit (Declaration under land ceiling act) wherever applicable','Home / Property','SECURITY','Review / Applicable'),
  ('F139','Authorisation letter from the joint owner for deposit of title deeds wherever applicable','Home / Property','SECURITY','Review / Applicable'),
  ('F149','Format of Inland Irrevocable Confirmed Letter of Credit','Home / Property','SECURITY','Review / Applicable'),
  ('F167','Letter of undertaking-cum-declaration for advances against immovable properties','Home / Property','SECURITY','Review / Applicable'),
  ('F179','Letter from owners of land while financing Builders and Flat Promoters','Home / Property','SECURITY','Review / Applicable'),
  ('F180','Letter to be obtained from the builder on his letter pad','Home / Property','SECURITY','Review / Applicable'),
  ('F186','Declaration/Undertaking from the borrower for reverse mortgage','Home / Property','SECURITY','Review / Applicable'),
  ('F187','Letter of Authority under Reverse Mortgage scheme','Home / Property','SECURITY','Review / Applicable'),
  ('F193','Letter of Undertaking to be obtained from Co-operative Housing Society','Home / Property','SECURITY','Review / Applicable'),
  ('F194','Letter from borrower to deposit the Share Certificate of the Co-operative Housing Society','Home / Property','SECURITY','Review / Applicable'),
  ('F20','Letter from bank to builder/dealer/vendor','Home / Property','SECURITY','Review / Applicable'),
  ('F6','Notice of the bank''s lien on specified goods to Warehouse Keeper','Home / Property','SECURITY','Review / Applicable'),
  ('F6A','Release order to warehouse keeper','Home / Property','SECURITY','Review / Applicable'),
  ('F6B','Warehouse keeper''s certificate (Model)','Home / Property','SECURITY','Review / Applicable'),
  ('F6C','Warehouse receipt (Model)','Home / Property','SECURITY','Review / Applicable'),
  ('177','GST Registration/Returns/3B Form','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('179','Sale Invoice/Bill','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('203','Proof of Business','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('255','DDE of Pre-Approved Business Loan','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('257','DDE of GST Advantage','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('60','Bill/Invoice','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('D105','Agreement for open cash credit (Stock/Book debt)','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('D125','Letter of Continuity (To be obtained when the original Working Capital limits are reduced)','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('D5','Partnership letter','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F104','Notice from our borrower to his debtor in connection with our advance against book debts','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F105','From the bank to the debtor of the borrower in connection with our advance against book debts','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F106','Auditor''s Certificate on book debts','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F138','Letter to be addressed to shipping company','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F153','Lien and mandate letter from borrower (Bank finance to employees to purchase their own company shares)','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F154','Letter from Bank to the company','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F163','Statement of inventories and receivables for OCC against stocks/bookdebts','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F32','Letter to Asset Management Company/Mutual Fund from Bank','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F36','Advance against Shares - Notice of lien from Bank to Company/other Banks','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F45','Specimen of Board Resolution for limited company','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F5','Partnership letter','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F5A','Bank''s Name Board for Key loan/Key Cash Credit','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F71','Power of attorney for collection of bills book debts and other receivables','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F7A','Bank''s Name Board for Open Cash Credit','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F8','Stock statement for open cash credit to manufacturing concerns','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F82','Declaration by Sole Proprietor','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F8A','Stock statement for open cash credit to trading concerns','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F8B','Stock Statement for Combined Working Capital Facility to Manufacturing Concerns','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F96','Certificate from bank to company - Ownership of shares held in bank''s name','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('F97','Letter to the company for cancellation of bank''s lien (Advances against shares)','MSME / Business / Working Capital','FINANCIAL','Review / Applicable'),
  ('134','Agriculture Credit Hypothecation (ACH)','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('152','Crop Insurance','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('39','Guarantee Agreement/Agricultural Credit Guarantee (ACG)','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('D112','Agreement cum declaration by Rural Credit Franchiser (RCF) to Bank','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('D119','Agreement for loan and hypothecation of crop - with Mutual Agreement clause','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('D121','Agreement-cum-indemnity for Agricultural Produce Loan','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('D68','Agreement for Hypothecation for Agricultural Loans (Direct / Allied Activities)','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('D68A','Hypothecation Agreement for Agricultural Advances (Direct/ indirect activities) without additional/collateral security','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('D70','Term Loan Agreement – PACS','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('D83','Hypothecation Agreement - second charge on machinery/movables','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F109','The form of guarantee under the IDBI Rediscouting Scheme for Deferred Sale of Indigenous Machinery','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F120A','Application for Agricultural Loan against pledge of Gold Ornaments','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F120B','Application for Non-Agricultural Loan against pledge of Gold Ornaments','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F140','Authorisation letter from lessor to lessee for installation of machinery','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F169','Power of Attorney from Rural Credit Franchiser (RCF) to bank','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F170','Application cum declaration for loan against pledge of gold ornaments from borrowers to RCF','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F170A','Application for secured overdraft Loan against pledge of Gold Ornaments from RCF scheme','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F64','Format of Banker''s Name Board for hypothecation of Machinery','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F74','Letter regarding particulars of vehicle/machinery','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('F79','Statement of stocks declared by the processing factory during each delivery','Agriculture / Agri Allied','LOAN_SPECIFIC','Review / Applicable'),
  ('205','Allotment or Admission Letter from College','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('206','Fee Structure from College','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('209','Statement of cost of study','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('211','Grading Format','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('225','Proof of 10th Marksheet','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('226','Proof of 12th Marksheet','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('227','Proof of Diploma Marksheet','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('229','Proof of Latest Qualification Document','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('F162','Undertaking letter from erstwhile minor for educational loans','Education Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('224','Driving License or Declaration to engage a Driver','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('254','RC Copy','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('59','Registration of vehicle','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('D127','Agreement of hypothecation of vehicles','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('D137','Agreement of Hypothecation of Vehicles (SVL)','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('D19A','Form 29 - Form of note of transfer of ownership of motor vehicle','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('D19B','Form 30 - Report of transfer of ownership of motor vehicle','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('D19C','Form 28 - Form for application for NOC of motor vehicle','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('D23','Letter of assignment/pledge of HP agreement','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('D51','Agreement of Hypothecation of hire purchase/lease agreements','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('F12','Application for making an entry of an agreement of hire purchase/lease/hypothecation subsequent to registration','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('F14','Periodical verification record for advances against Hire Purchase agreements','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('F15','Advance against hire purchase agreements - Specimen of sale letter','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('F181','Letter to be sent to the borrower before seizure of the vehicle (for NPA accounts)','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('F70','General power of attorney to be executed in bank''s favour by financiers pledging/lodging HP Agreements','Vehicle / Machinery','LOAN_SPECIFIC','Review / Applicable'),
  ('F124','Auctioning of jewels pledged','Gold Loan','LOAN_SPECIFIC','Review / Applicable'),
  ('215','SHG Card','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('216','SHG Info Card','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('D02','Demand Promissory Note (Exclusively for SHG advances)','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('D102','Articles of Loan Agreement for financing of Self Help Groups','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('D124','Deed of Accession (to be obtained when new members join the Self Help Group)','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('F157','Resolution by Self Help Group Members','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('F158','Undertaking letter by SHG members','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('F159','Self Help Group - Copy of resolution regarding repayment of loan','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('F160','Loan disbursement/end use statement for advances to SHG','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('F165','Interse agreement executed by members of SHG','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('F176','Letter of undertaking from Joint Liability Groups','SHG / JLG','LOAN_SPECIFIC','Review / Applicable'),
  ('157','Home / Employer / Unit Visit Report','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('202','Offer Letter from Present Employer','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('222','Pension Payment Order-PPO','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('D94','Agreement - Bank Finance to employees to buy shares of their own companies','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('F156','Letter of Authority (For Staff)','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('F191','Letter from borrower to his employer where tie-up arrangement is made','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('F192','Letter from employer of the borrower to the Bank where tie-up arrangement is made','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('F197','Letter of Undertaking from the pensioner','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('F198','Letter of Undertaking from the family members of the pensioner','Staff / Pensioner','LOAN_SPECIFIC','Review / Applicable'),
  ('D28','Application-cum-Agreement for Packing credit (Pre-shipment) Advance','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('D35','Agreement for Bills Purchased','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('D48','Agreement of Irrevocable Letter of Credit/Authority for Payment','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('D50','Agreement for Bridge Loan','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('D57','Agreement of Guarantee','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('D73','Agreement for hypothecation of goods received under advance payment guarantees/LCs etc.','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F108','Format of Bank Guarantee Bond','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F111','Letter addressed to beneficiary to return the guarantee','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F131','Letter to be taken from Bankers to the Issue for Bridge loans','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F132','Letter to be taken from Underwriters for bridge loans against their Underwriting Commitment','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F135','Letter from Financial Institution to the Bank (for Bridge Loans)','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F23','Statement of stocks against Export Trust Receipt','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F24','Indemnity by borrower in respect of bank''s signing letters of guarantee/indemnity to shipping companies','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F25','Specimen of usance bill (New Bill Market Scheme)','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F44','Form of Counter Guarantee','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F44C','Counter Guarantee for DPGs / Usance Bills Acceptance facilities','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F44D','Counter-guarantees to be obtained for Bid Bond Guarantees','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F73','Agreement-cum-Pledge Letter for securing Term Deposits as margin for Guarantees/Letter of Credit/Bills Purchased facilities','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('F75','Extension of guarantee','Trade Finance / BG / LC','LOAN_SPECIFIC','Review / Applicable'),
  ('171','TDR Receipt','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('D108','Agreement for loan against NSCs','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('D116B','Power of attorney in favour of third persons for operation of safe deposit locker','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F100','Irrevocable letter of authority to Post Office to pay the maturity proceeds/interest','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F29','Application cum pledge letter for advance against deposits','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F29A','Application for advance against third party deposits','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F29B','Application for Additional Loan against Deposit','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F29C','Application for additional loan against deposits','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F30','Application cum pledge letter for advance against Government Securities (other than NSCs/KVPs), shares of Limited Companies/L.I.C. Policies','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F31','Advance against units of mutual funds - Letter of authority from party','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F35','Advance Against Shares - Lien and Mandate Letter to be taken from Shareholder','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F35A','Lien and Mandate Letter to be taken from Bondholder for Advance Against Bonds','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F39','Form of Confirmation of holdings- shares','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F41','Form of assignment of life policy','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F42','Notice of assignment of life policy to Life insurance corporation','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F62','Application for the transfer of post office time Deposit account as security','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F67','Letter of authority from a joint holder of a fixed deposit','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F72','Letter of indemnity to be obtained from the guardian for loan against deposit standing in the name of a minor','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F90','Letter to be addressed to other branch for noting the fact of pledge of deposit receipt','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F93','Third party letter of pledge of Securities','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F95','Declaration to be taken from the borrower bank for advance against shares','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F99','Application for transfer of National Savings Certificates as security','Loan Against Deposits / Securities','SECURITY','Review / Applicable'),
  ('F21','Process sheet for the use of branches for Consumer credit loans','Consumer Credit','LOAN_SPECIFIC','Review / Applicable'),
  ('148','Valuation report','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('150','Confirmation of Charge Creation','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('154','CERSAI Search Report','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('155','CERSAI Charge Creation','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('160','Insurance (Hypothecation in favour of Bank)','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('164','ROC Charge Creation','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('173','Due diligence sheet','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('27','Legal opinion-search-cum-NEC','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('28','Appraisal','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('51','Legal Audit Report','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('55','CERSAI registration/modification','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('56','Insurance of Primary assets','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('57','Insurance of collateral assets','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('F128','Search report','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('F175','Letter to advocate seeking legal opinion on the title of the properties offered as security','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('F178','Legal Scrutiny Report','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('F94','Registered notice to be sent to policy holder before surrendering the policy for advances against life insurance policies','Legal / Security / Pre-sanction','SECURITY','Facility/security dependent'),
  ('174','Pre-sanction visit report','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('175','Sanction Ticket','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('176','Internal Rating','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('208','Sanction Letter from Competent Authority','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('218','Presanctioned limit report','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('220','Deviation Document','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('223','Project Approval Letter','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('32','Acknowledgement of sanction letter','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('58','Compliance of special terms and condition','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('D16','Single/Joint/Joint and Several Demand Promissory Notes (applicable for advances sanctioned with fixed and floating rate of interest)','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('F134','Letter from the Bank to the Financial Institution seeking consent for sanctioning of bridge finance and disbursing loan/subsidy directly','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('F143','Letter for drawal against the limit sanctioned','Sanction / Monitoring / Compliance','OTHER','Facility/security dependent'),
  ('D116C','Letter of indemnity for issue of duplicate safe custody receipt','Locker / Safe Custody','OTHER','Review / Applicable'),
  ('1','Top Sheet','General / Other','APPLICATION','Review / Applicable'),
  ('114','NCGTC Coverage','General / Other','APPLICATION','Review / Applicable'),
  ('116','ECLGS Coverage','General / Other','APPLICATION','Review / Applicable'),
  ('130','Last DVA approval sheet','General / Other','APPLICATION','Review / Applicable'),
  ('144','ACM/ACM-1','General / Other','APPLICATION','Review / Applicable'),
  ('151','PAIS Coverage','General / Other','APPLICATION','Review / Applicable'),
  ('156','Dealer Verification Report','General / Other','APPLICATION','Review / Applicable'),
  ('162','Certified copy of chain deed','General / Other','APPLICATION','Review / Applicable'),
  ('169','Inter SE Agreement','General / Other','APPLICATION','Review / Applicable'),
  ('172','UP Receipt','General / Other','APPLICATION','Review / Applicable'),
  ('178','Balance Sheet (Audited or Unaudited)','General / Other','APPLICATION','Review / Applicable'),
  ('2','Application','General / Other','APPLICATION','Review / Applicable'),
  ('20','Estimate details of proposed construction','General / Other','APPLICATION','Review / Applicable'),
  ('201','Loan Outstanding letter','General / Other','APPLICATION','Review / Applicable'),
  ('207','Rejection Approval Document','General / Other','APPLICATION','Review / Applicable'),
  ('21','Quotation','General / Other','APPLICATION','Review / Applicable'),
  ('210','Agreement Cum acknowledgement','General / Other','APPLICATION','Review / Applicable'),
  ('212','Group Picture','General / Other','APPLICATION','Review / Applicable'),
  ('213','Inter-se-Agreement','General / Other','APPLICATION','Review / Applicable'),
  ('214','MAPC Letter','General / Other','APPLICATION','Review / Applicable'),
  ('217','Sponsor Letter','General / Other','APPLICATION','Review / Applicable'),
  ('219','PRI Declaration Format','General / Other','APPLICATION','Review / Applicable'),
  ('230','Score card','General / Other','APPLICATION','Review / Applicable'),
  ('231','Fishermen card','General / Other','APPLICATION','Review / Applicable'),
  ('232','Boat License','General / Other','APPLICATION','Review / Applicable'),
  ('252','Commissioning Certificate','General / Other','APPLICATION','Review / Applicable'),
  ('253','Receipt Of Advance','General / Other','APPLICATION','Review / Applicable'),
  ('256','DDE of Ind Digi PM Vishwakarma Loan','General / Other','APPLICATION','Review / Applicable'),
  ('258','DDE of Pre-Approved Personal Loan','General / Other','APPLICATION','Review / Applicable'),
  ('40','Agreement for sale','General / Other','APPLICATION','Review / Applicable'),
  ('43','Tripartite Agreement','General / Other','APPLICATION','Review / Applicable'),
  ('52','PSRC','General / Other','APPLICATION','Review / Applicable'),
  ('53','PDCPAR','General / Other','APPLICATION','Review / Applicable'),
  ('54','ROC registration/modification','General / Other','APPLICATION','Review / Applicable'),
  ('61','CGTMSE Coverage','General / Other','APPLICATION','Review / Applicable'),
  ('D1','Single/Joint DPN (for advances with floating rate of interest)','General / Other','APPLICATION','Review / Applicable'),
  ('D11','Acknowledgment of debt cum security','General / Other','APPLICATION','Review / Applicable'),
  ('D117','Funded Interest Term Loan Agreement','General / Other','APPLICATION','Review / Applicable'),
  ('D118','Agreement to retain Right of Recompense','General / Other','APPLICATION','Review / Applicable'),
  ('D12','Stamped letter of lien and set off from borrowers','General / Other','APPLICATION','Review / Applicable'),
  ('D120','Joint Liability Agreement','General / Other','APPLICATION','Review / Applicable'),
  ('D123','Agreement for financial assistance under Credit Linked Capital Subsidy Scheme (CLCSS)','General / Other','APPLICATION','Review / Applicable'),
  ('D13','Agreement of pledge of goods/Document of Title to goods','General / Other','APPLICATION','Review / Applicable'),
  ('D19D','Declaration in the absence of NOC','General / Other','APPLICATION','Review / Applicable'),
  ('D1A','Single/Joint DPN (for advances with fixed rate of interest)','General / Other','APPLICATION','Review / Applicable'),
  ('D1F','DPN with interest slabs','General / Other','APPLICATION','Review / Applicable'),
  ('D2','Joint and Several DPN (for advances with floating rate of interest)','General / Other','APPLICATION','Review / Applicable'),
  ('D20','True Copy of the Certificate of Registration','General / Other','APPLICATION','Review / Applicable'),
  ('D21','Notice to hirers from Bank','General / Other','APPLICATION','Review / Applicable'),
  ('D22','Copy of notice of assignment from financier to Hirer to be held by the branch','General / Other','APPLICATION','Review / Applicable'),
  ('D3','Letter of Continuity','General / Other','APPLICATION','Review / Applicable'),
  ('D36','Medium Term Loan Agreement','General / Other','APPLICATION','Review / Applicable'),
  ('D56','Agreement drawback for advance against duty drawback','General / Other','APPLICATION','Review / Applicable'),
  ('D6','Joint Hindu Family Letter','General / Other','APPLICATION','Review / Applicable'),
  ('D7','Disposal of proceeds letter','General / Other','APPLICATION','Review / Applicable'),
  ('D70A','Agreement for advances granted to NGOs/VAs','General / Other','APPLICATION','Review / Applicable'),
  ('D77','Hypothecation Deed executed by the Guarantor','General / Other','APPLICATION','Review / Applicable'),
  ('D81','Agreement for co-acceptance of bills under New Bill Market Scheme of Reserve Bank of India/Drawee Bill Scheme','General / Other','APPLICATION','Review / Applicable'),
  ('D86','Deed of lease','General / Other','APPLICATION','Review / Applicable'),
  ('D8A','Covering letter for DPN (for temporary Overdraft)','General / Other','APPLICATION','Review / Applicable'),
  ('D93','Letter of undertaking','General / Other','APPLICATION','Review / Applicable'),
  ('D9A','Acknowledgement of Debt to be obtained from the Legal Heir of the Deceased','General / Other','APPLICATION','Review / Applicable'),
  ('D9B','Acknowledgment within three years from the date of allowing TOD','General / Other','APPLICATION','Review / Applicable'),
  ('F1','Goods lodgement letter','General / Other','APPLICATION','Review / Applicable'),
  ('F10','Stock certificate to be obtained fortnightly/monthly from the approved clearing agents','General / Other','APPLICATION','Review / Applicable'),
  ('F101','Delivery order for issuing on clearing agents','General / Other','APPLICATION','Review / Applicable'),
  ('F102','Notice to railway authorities','General / Other','APPLICATION','Review / Applicable'),
  ('F103','Indemnity discrepancies for bills negotiated with discrepancies','General / Other','APPLICATION','Review / Applicable'),
  ('F107','Letter of undertaking for advance against uncleared effects','General / Other','APPLICATION','Review / Applicable'),
  ('F11','Form of agreement with clearing agents','General / Other','APPLICATION','Review / Applicable'),
  ('F110','Notice for payment of instalments under UDA/DPG','General / Other','APPLICATION','Review / Applicable'),
  ('F112','Letter from person who witnesses documents executed by illiterate/blind person','General / Other','APPLICATION','Review / Applicable'),
  ('F113','Letter from borrower for creation of second charge in favour of the bank','General / Other','APPLICATION','Review / Applicable'),
  ('F114','Letter from the Bank to the Financial Institution to get the consent for creation of second charge','General / Other','APPLICATION','Review / Applicable'),
  ('F115','Letter from Financial Institution communicating their consent for creation of second charge','General / Other','APPLICATION','Review / Applicable'),
  ('F116','Letter to Financial Institution intimating creation of Second Charge','General / Other','APPLICATION','Review / Applicable'),
  ('F118','Letter addressed by the borrower to sugar mill or Procuring agency','General / Other','APPLICATION','Review / Applicable'),
  ('F119','Letter from sugar mill or procuring agency to the bank','General / Other','APPLICATION','Review / Applicable'),
  ('F127','Certificate from the Co-operative Society','General / Other','APPLICATION','Review / Applicable'),
  ('F129','Solvency Certificate','General / Other','APPLICATION','Review / Applicable'),
  ('F133','Letter from the borrower to the financial institution to disburse loan/subsidy directly to the Bank','General / Other','APPLICATION','Review / Applicable'),
  ('F136','Letter from Financial Institution intimating them of disbursement of bridge finance','General / Other','APPLICATION','Review / Applicable'),
  ('F141','Statement of Assets with lessee and rentals receivables as on 31st March','General / Other','APPLICATION','Review / Applicable'),
  ('F142','Monthly statement of rentals due from lessees','General / Other','APPLICATION','Review / Applicable'),
  ('F144','Letter for drawal against the Medium-Term Credit Limit','General / Other','APPLICATION','Review / Applicable'),
  ('F145','Disbursement Statement (STPL)','General / Other','APPLICATION','Review / Applicable'),
  ('F146','Disbursement statement for Medium-Term Loans','General / Other','APPLICATION','Review / Applicable'),
  ('F147','Due date notice for recovery of loan/instalment','General / Other','APPLICATION','Review / Applicable'),
  ('F148','Letter from borrower - Consent for rephasement of loan instalments','General / Other','APPLICATION','Review / Applicable'),
  ('F148A','Letter to be taken from borrower and guarantor for rephasement of loan (Ag-MTL)','General / Other','APPLICATION','Review / Applicable'),
  ('F16','Letter to guarantor and his reply','General / Other','APPLICATION','Review / Applicable'),
  ('F161','Letter of Undertaking (FCPC Facility)','General / Other','APPLICATION','Review / Applicable'),
  ('F164','Consent letter from borrowers for disclosure of information','General / Other','APPLICATION','Review / Applicable'),
  ('F164A','Consent letter from guarantor for disclosure of information','General / Other','APPLICATION','Review / Applicable'),
  ('F171','Affidavit to be submitted in lieu of EC for SHL accounts','General / Other','APPLICATION','Review / Applicable'),
  ('F172','Declaration by borrower regarding details of relatives working in our bank/other banks','General / Other','APPLICATION','Review / Applicable'),
  ('F173','Capability Certificate','General / Other','APPLICATION','Review / Applicable'),
  ('F174','Letter of Undertaking from the Private Financier (under FODUP scheme)','General / Other','APPLICATION','Review / Applicable'),
  ('F177','Letter ceding Pari passu charge','General / Other','APPLICATION','Review / Applicable'),
  ('F184','Transfer Deed / Pledge form duly dated/signed','General / Other','APPLICATION','Review / Applicable'),
  ('F185','Draft of Will','General / Other','APPLICATION','Review / Applicable'),
  ('F188','Application cum Declaration Form for OD/General Credit Card for Financial Exclusion Category','General / Other','APPLICATION','Review / Applicable'),
  ('F19','Letter from Borrower to dealer/vendor','General / Other','APPLICATION','Review / Applicable'),
  ('F190','Letter of authority from borrower - common','General / Other','APPLICATION','Review / Applicable'),
  ('F195','Letter for releasing the loan/funds in stages','General / Other','APPLICATION','Review / Applicable'),
  ('F196','Letter from borrower to Registrar to deliver the Original documents to the Bank after Registration','General / Other','APPLICATION','Review / Applicable'),
  ('F19A','Letter from Borrower to dealer/vendor on delivery of goods with instruction on disposal of proceeds','General / Other','APPLICATION','Review / Applicable'),
  ('F2','Godown certificate','General / Other','APPLICATION','Review / Applicable'),
  ('F200','Letter of Authority from the Staff to Bank to appropriate terminal benefits towards adjustment of loan - A','General / Other','APPLICATION','Review / Applicable'),
  ('F201','End Use Certificate','General / Other','APPLICATION','Review / Applicable'),
  ('F202','Format of Letter of Undertaking by Corporate Borrowers','General / Other','APPLICATION','Review / Applicable'),
  ('F203','Certificate of Compliance','General / Other','APPLICATION','Review / Applicable'),
  ('F204','Guarantor''s Form (Profile of the Guarantor)','General / Other','APPLICATION','Review / Applicable'),
  ('F3','Godown card','General / Other','APPLICATION','Review / Applicable'),
  ('F4','Rent Letter','General / Other','APPLICATION','Review / Applicable'),
  ('F46','Negative lien on fixed and liquid assets of Limited companies','General / Other','APPLICATION','Review / Applicable'),
  ('F47','Form no. CHG-1 - Particulars for creation of charge by limited companies','General / Other','APPLICATION','Review / Applicable'),
  ('F49','Form CHG-4 - Particulars for satisfaction of charge (while adjusting the liabilities)','General / Other','APPLICATION','Review / Applicable'),
  ('F51','Certificate to be taken from Joint stock companies every year in respect of their total borrowings','General / Other','APPLICATION','Review / Applicable'),
  ('F52','Statement of book-debts from borrowers','General / Other','APPLICATION','Review / Applicable'),
  ('F63','Covering letter for loans and advances for which there are no special agreements','General / Other','APPLICATION','Review / Applicable'),
  ('F65','Letter of authority - From Registered Coffee Estate Owner to Coffee Board','General / Other','APPLICATION','Review / Applicable'),
  ('F66','Power of attorney by registered coffee estate owner in favour of the bank','General / Other','APPLICATION','Review / Applicable'),
  ('F71A','Power of attorney to manage theatre','General / Other','APPLICATION','Review / Applicable'),
  ('F72A','Letter of indemnity for collection of bills','General / Other','APPLICATION','Review / Applicable'),
  ('F76','Letter of intimation from borrower for handing over of goods to the processing factory','General / Other','APPLICATION','Review / Applicable'),
  ('F77','Letter of undertaking by the processing factory','General / Other','APPLICATION','Review / Applicable'),
  ('F78','Noting of bank''s lien - letters of confirmation from the factory','General / Other','APPLICATION','Review / Applicable'),
  ('F80','Letter from the bank official after inspection of goods at the factory','General / Other','APPLICATION','Review / Applicable'),
  ('F83','Renewal covering letter in respect of DPN signed by the reconstituted firm and partners','General / Other','APPLICATION','Review / Applicable'),
  ('F83A','Covering letter extending the liabilities under Term Loan to Reconstituted firm and its partners','General / Other','APPLICATION','Review / Applicable'),
  ('F84','Resolution required to be passed by a Society/Club/Trust etc.','General / Other','APPLICATION','Review / Applicable'),
  ('F86','Request letter from borrower for transfer of Account from one branch to another','General / Other','APPLICATION','Review / Applicable'),
  ('F87','Letter of Pegging','General / Other','APPLICATION','Review / Applicable'),
  ('F88','Undertaking letter for payment of interest charged during the holiday period','General / Other','APPLICATION','Review / Applicable'),
  ('F89','Covering letter for renewal of time-barred DPN','General / Other','APPLICATION','Review / Applicable'),
  ('F9','Indemnity from parties in respect of clearance of goods under Import Trust Receipt','General / Other','APPLICATION','Review / Applicable')
)
insert into document_master (code, name, category_group, document_category_id, priority)
select mv.code, mv.name, mv.category_group, dc.id, nullif(mv.priority, '')
from mv
join document_categories dc on dc.code = mv.doc_cat_code
on conflict (code) do nothing;
