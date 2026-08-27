/* ===========================================================================
   Rostered - contingent workforce register
   01_schema.sql : tables, constraints and indexes
   Target       : SQL Server 2019+ / Azure SQL Database

   FTE convention: FteScale units (100 by default) equal 1.0 FTE, which equals
   one StandardWeekHours week (40 by default). Nothing in this schema stores a
   derived FTE - it is computed in the views so the model can never drift from
   the settings row.
   =========================================================================== */

IF SCHEMA_ID('wf') IS NULL EXEC('CREATE SCHEMA wf');
GO

/* --------------------------------------------------------------- settings - */

IF OBJECT_ID('wf.Settings', 'U') IS NULL
CREATE TABLE wf.Settings (
    SettingsId                   TINYINT       NOT NULL CONSTRAINT PK_Settings PRIMARY KEY,
    StandardWeekHours            DECIMAL(5,2)  NOT NULL CONSTRAINT DF_Settings_Hours DEFAULT (40),
    FteScale                     DECIMAL(9,2)  NOT NULL CONSTRAINT DF_Settings_Scale DEFAULT (100),
    DepartmentFteBudget          DECIMAL(9,2)  NOT NULL CONSTRAINT DF_Settings_Budget DEFAULT (100),
    PermanentFte                 DECIMAL(9,2)  NOT NULL CONSTRAINT DF_Settings_Perm DEFAULT (0),
    WorkingDaysPerWeek           DECIMAL(4,2)  NOT NULL CONSTRAINT DF_Settings_Days DEFAULT (5),
    WeeksPerYear                 DECIMAL(5,2)  NOT NULL CONSTRAINT DF_Settings_Weeks DEFAULT (52),
    Currency                     CHAR(3)       NOT NULL CONSTRAINT DF_Settings_Ccy DEFAULT ('NZD'),
    EndWarningDays               INT           NOT NULL CONSTRAINT DF_Settings_EndWarn DEFAULT (60),
    MaxTenureMonths              INT           NOT NULL CONSTRAINT DF_Settings_Tenure DEFAULT (24),
    PoBurnWarnRatio              DECIMAL(5,4)  NOT NULL CONSTRAINT DF_Settings_Burn DEFAULT (0.80),
    VendorConcentrationWarnRatio DECIMAL(5,4)  NOT NULL CONSTRAINT DF_Settings_Conc DEFAULT (0.40),
    ApprovalThreshold            DECIMAL(18,2) NOT NULL CONSTRAINT DF_Settings_Appr DEFAULT (100000),
    RateVarianceWarnRatio        DECIMAL(5,4)  NOT NULL CONSTRAINT DF_Settings_RateVar DEFAULT (0.10),
    GstRate                      DECIMAL(5,4)  NOT NULL CONSTRAINT DF_Settings_Gst DEFAULT (0.15),
    InvoiceApprovalSlaDays       INT           NOT NULL CONSTRAINT DF_Settings_InvSla DEFAULT (5),
    DefaultPaymentTermsDays      INT           NOT NULL CONSTRAINT DF_Settings_Terms DEFAULT (30),
    ApprovalChaseAfterDays       INT           NOT NULL CONSTRAINT DF_Settings_Chase DEFAULT (5),
    InvoiceExpectedAfterDays     INT           NOT NULL CONSTRAINT DF_Settings_InvExp DEFAULT (10),
    OrganisationName             NVARCHAR(200) NULL,
    TeamName                     NVARCHAR(200) NULL,
    CONSTRAINT CK_Settings_Single CHECK (SettingsId = 1)
);
GO

/* ----------------------------------------------------------------- vendor - */

IF OBJECT_ID('wf.Vendor', 'U') IS NULL
CREATE TABLE wf.Vendor (
    VendorId             VARCHAR(40)   NOT NULL CONSTRAINT PK_Vendor PRIMARY KEY,
    VendorName           NVARCHAR(200) NOT NULL,
    VendorType           VARCHAR(20)   NOT NULL CONSTRAINT CK_Vendor_Type
                             CHECK (VendorType IN ('agency','consultancy','msp','direct','other')),
    AccountManagerName   NVARCHAR(200) NULL,
    AccountManagerEmail  NVARCHAR(320) NULL,
    AccountManagerPhone  NVARCHAR(60)  NULL,
    MsaRef               NVARCHAR(80)  NULL,
    MsaExpiry            DATE          NULL,
    MarginPct            DECIMAL(6,3)  NULL,
    PaymentTermsDays     INT           NULL,
    PiInsuranceExpiry    DATE          NULL,
    PlInsuranceExpiry    DATE          NULL,
    IsActive             BIT           NOT NULL CONSTRAINT DF_Vendor_Active DEFAULT (1),
    Notes                NVARCHAR(MAX) NULL
);
GO

/* ---------------------------------------------------------------- project - */

IF OBJECT_ID('wf.Project', 'U') IS NULL
CREATE TABLE wf.Project (
    ProjectId   VARCHAR(40)   NOT NULL CONSTRAINT PK_Project PRIMARY KEY,
    ProjectName NVARCHAR(200) NOT NULL,
    ProjectCode NVARCHAR(40)  NULL,
    CostCentre  NVARCHAR(40)  NULL,
    Sponsor     NVARCHAR(200) NULL,
    Budget      DECIMAL(18,2) NULL,
    IsActive    BIT           NOT NULL CONSTRAINT DF_Project_Active DEFAULT (1)
);
GO

/* --------------------------------------------------------------- ratecard - */

IF OBJECT_ID('wf.RateCard', 'U') IS NULL
CREATE TABLE wf.RateCard (
    RateCardId      VARCHAR(40)   NOT NULL CONSTRAINT PK_RateCard PRIMARY KEY,
    Role            NVARCHAR(200) NOT NULL,
    RoleLevel       NVARCHAR(60)  NULL,
    BenchmarkHourly DECIMAL(18,2) NOT NULL,
    Source          NVARCHAR(200) NULL,
    ReviewedOn      DATE          NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RateCard_Role')
CREATE UNIQUE INDEX IX_RateCard_Role ON wf.RateCard (Role);
GO

/* ------------------------------------------------------------- contractor - */

IF OBJECT_ID('wf.Contractor', 'U') IS NULL
CREATE TABLE wf.Contractor (
    ContractorId                 VARCHAR(40)   NOT NULL CONSTRAINT PK_Contractor PRIMARY KEY,
    WorkerId                     NVARCHAR(40)  NULL,   -- key back to the HR system of record
    FirstName                    NVARCHAR(100) NOT NULL,
    LastName                     NVARCHAR(100) NOT NULL,
    PreferredName                NVARCHAR(100) NULL,
    Email                        NVARCHAR(320) NULL,
    Phone                        NVARCHAR(60)  NULL,
    DateOfBirth                  DATE          NULL,
    Gender                       NVARCHAR(60)  NULL,
    Nationality                  NVARCHAR(100) NULL,
    WorkRightsType               NVARCHAR(120) NULL,
    WorkRightsExpiry             DATE          NULL,
    Location                     NVARCHAR(120) NULL,
    EmergencyContactName         NVARCHAR(200) NULL,
    EmergencyContactRelationship NVARCHAR(80)  NULL,
    EmergencyContactPhone        NVARCHAR(60)  NULL,

    EngagementType               VARCHAR(20)   NOT NULL CONSTRAINT CK_Contractor_EngType
                                     CHECK (EngagementType IN ('direct','intermediated')),
    VendorId                     VARCHAR(40)   NULL
                                     CONSTRAINT FK_Contractor_Vendor REFERENCES wf.Vendor (VendorId),
    Role                         NVARCHAR(200) NULL,
    Team                         NVARCHAR(120) NULL,
    HiringManager                NVARCHAR(200) NULL,
    EngagementStatus             VARCHAR(20)   NOT NULL CONSTRAINT CK_Contractor_Status
                                     CHECK (EngagementStatus IN ('pipeline','onboarding','active','notice','ended')),
    StartDate                    DATE          NULL,
    EndDate                      DATE          NULL,
    OriginalEndDate              DATE          NULL,
    HoursPerWeek                 DECIMAL(6,2)  NOT NULL CONSTRAINT DF_Contractor_Hours DEFAULT (40),

    RateBasis                    VARCHAR(10)   NOT NULL CONSTRAINT CK_Contractor_Basis
                                     CHECK (RateBasis IN ('hourly','daily')),
    ChargeRate                   DECIMAL(18,2) NOT NULL CONSTRAINT DF_Contractor_Charge DEFAULT (0),
    PayRate                      DECIMAL(18,2) NULL,

    ContractRef                  NVARCHAR(80)  NULL,
    PoNumber                     NVARCHAR(80)  NULL,
    PoValue                      DECIMAL(18,2) NULL,
    PoSpentToDate                DECIMAL(18,2) NOT NULL CONSTRAINT DF_Contractor_PoSpent DEFAULT (0),
    ExtensionCount               INT           NOT NULL CONSTRAINT DF_Contractor_Ext DEFAULT (0),
    NoticePeriodDays             INT           NOT NULL CONSTRAINT DF_Contractor_Notice DEFAULT (0),
    StatusTestCompleted          BIT           NOT NULL CONSTRAINT DF_Contractor_StatusTest DEFAULT (0),
    BackgroundCheckCompleted     BIT           NOT NULL CONSTRAINT DF_Contractor_Bgc DEFAULT (0),
    HealthSafetyInducted         BIT           NOT NULL CONSTRAINT DF_Contractor_Hs DEFAULT (0),
    SecurityClearance            NVARCHAR(60)  NULL,
    ApprovalRef                  NVARCHAR(80)  NULL,
    RehireEligible               VARCHAR(10)   NOT NULL CONSTRAINT CK_Contractor_Rehire
                                     CHECK (RehireEligible IN ('yes','no','unknown'))
                                     CONSTRAINT DF_Contractor_Rehire DEFAULT ('unknown'),
    PerformanceNote              NVARCHAR(MAX) NULL,
    Notes                        NVARCHAR(MAX) NULL,

    CONSTRAINT CK_Contractor_Dates CHECK (EndDate IS NULL OR StartDate IS NULL OR EndDate >= StartDate),
    CONSTRAINT CK_Contractor_Vendor_Required
        CHECK (EngagementType = 'direct' OR VendorId IS NOT NULL)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Contractor_Status')
CREATE INDEX IX_Contractor_Status ON wf.Contractor (EngagementStatus) INCLUDE (Team, VendorId, EndDate);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Contractor_EndDate')
CREATE INDEX IX_Contractor_EndDate ON wf.Contractor (EndDate);
GO

/* ------------------------------------------------------------- allocation - */

IF OBJECT_ID('wf.Allocation', 'U') IS NULL
CREATE TABLE wf.Allocation (
    ContractorId VARCHAR(40)  NOT NULL
        CONSTRAINT FK_Allocation_Contractor REFERENCES wf.Contractor (ContractorId) ON DELETE CASCADE,
    ProjectId    VARCHAR(40)  NOT NULL
        CONSTRAINT FK_Allocation_Project REFERENCES wf.Project (ProjectId),
    SharePct     DECIMAL(6,2) NOT NULL CONSTRAINT CK_Allocation_Share CHECK (SharePct >= 0 AND SharePct <= 100),
    CONSTRAINT PK_Allocation PRIMARY KEY (ContractorId, ProjectId)
);
GO

/* -------------------------------------------------------- access / assets - */

IF OBJECT_ID('wf.AccessAccount', 'U') IS NULL
CREATE TABLE wf.AccessAccount (
    AccessAccountId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccessAccount PRIMARY KEY,
    ContractorId    VARCHAR(40)   NOT NULL
        CONSTRAINT FK_Access_Contractor REFERENCES wf.Contractor (ContractorId) ON DELETE CASCADE,
    SystemName      NVARCHAR(200) NOT NULL,
    AccountStatus   VARCHAR(20)   NOT NULL CONSTRAINT CK_Access_Status
                        CHECK (AccountStatus IN ('not-requested','requested','active','revoked')),
    RequestedOn     DATE NULL,
    RevokedOn       DATE NULL
);
GO

IF OBJECT_ID('wf.Asset', 'U') IS NULL
CREATE TABLE wf.Asset (
    AssetId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Asset PRIMARY KEY,
    ContractorId VARCHAR(40)   NOT NULL
        CONSTRAINT FK_Asset_Contractor REFERENCES wf.Contractor (ContractorId) ON DELETE CASCADE,
    ItemName     NVARCHAR(200) NOT NULL,
    AssetTag     NVARCHAR(80)  NULL,
    IssuedOn     DATE NULL,
    ReturnedOn   DATE NULL
);
GO

IF OBJECT_ID('wf.ChecklistItem', 'U') IS NULL
CREATE TABLE wf.ChecklistItem (
    ChecklistItemId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ChecklistItem PRIMARY KEY,
    ContractorId    VARCHAR(40)   NOT NULL
        CONSTRAINT FK_Checklist_Contractor REFERENCES wf.Contractor (ContractorId) ON DELETE CASCADE,
    Phase           VARCHAR(20)   NOT NULL CONSTRAINT CK_Checklist_Phase
                        CHECK (Phase IN ('onboarding','offboarding')),
    Task            NVARCHAR(300) NOT NULL,
    IsDone          BIT           NOT NULL CONSTRAINT DF_Checklist_Done DEFAULT (0),
    DueDate         DATE          NULL,
    Owner           NVARCHAR(200) NULL
);
GO

/* ------------------------------------------------------------------ comms - */

IF OBJECT_ID('wf.Comms', 'U') IS NULL
CREATE TABLE wf.Comms (
    CommsId      VARCHAR(40)   NOT NULL CONSTRAINT PK_Comms PRIMARY KEY,
    CommsDate    DATE          NOT NULL,
    Channel      VARCHAR(20)   NOT NULL CONSTRAINT CK_Comms_Channel
                     CHECK (Channel IN ('email','call','meeting','teams','note')),
    Direction    VARCHAR(20)   NOT NULL CONSTRAINT CK_Comms_Direction
                     CHECK (Direction IN ('outbound','inbound','internal')),
    ContractorId VARCHAR(40)   NULL CONSTRAINT FK_Comms_Contractor REFERENCES wf.Contractor (ContractorId),
    VendorId     VARCHAR(40)   NULL CONSTRAINT FK_Comms_Vendor REFERENCES wf.Vendor (VendorId),
    Subject      NVARCHAR(400) NULL,
    Summary      NVARCHAR(MAX) NULL,
    Participants NVARCHAR(400) NULL,
    FollowUpDate DATE          NULL,
    Topic        NVARCHAR(120) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Comms_FollowUp')
CREATE INDEX IX_Comms_FollowUp ON wf.Comms (FollowUpDate) WHERE FollowUpDate IS NOT NULL;
GO

/* -------------------------------------------------------------- reminders - */

IF OBJECT_ID('wf.Reminder', 'U') IS NULL
CREATE TABLE wf.Reminder (
    ReminderId     VARCHAR(80)   NOT NULL CONSTRAINT PK_Reminder PRIMARY KEY,
    ReminderType   VARCHAR(30)   NOT NULL,
    Title          NVARCHAR(300) NOT NULL,
    Detail         NVARCHAR(MAX) NULL,
    DueDate        DATE          NULL,
    ContractorId   VARCHAR(40)   NULL CONSTRAINT FK_Reminder_Contractor REFERENCES wf.Contractor (ContractorId),
    VendorId       VARCHAR(40)   NULL CONSTRAINT FK_Reminder_Vendor REFERENCES wf.Vendor (VendorId),
    ReminderStatus VARCHAR(20)   NOT NULL CONSTRAINT CK_Reminder_Status
                       CHECK (ReminderStatus IN ('open','done','dismissed')),
    IsDerived      BIT           NOT NULL CONSTRAINT DF_Reminder_Derived DEFAULT (0),
    Owner          NVARCHAR(200) NULL
);
GO

/* ------------------------------------------------------------- date table - */
/* A contiguous date dimension so Power BI time intelligence behaves. Extend
   the range to suit; ten years is usually plenty for contingent workforce. */

IF OBJECT_ID('wf.DimDate', 'U') IS NULL
BEGIN
    CREATE TABLE wf.DimDate (
        [Date]        DATE        NOT NULL CONSTRAINT PK_DimDate PRIMARY KEY,
        [Year]        SMALLINT    NOT NULL,
        [Quarter]     TINYINT     NOT NULL,
        [MonthNumber] TINYINT     NOT NULL,
        [MonthName]   VARCHAR(20) NOT NULL,
        [MonthYear]   CHAR(8)     NOT NULL,
        [WeekStart]   DATE        NOT NULL,
        [IsWeekday]   BIT         NOT NULL,
        [FinYear]     SMALLINT    NOT NULL   -- NZ financial year ending 30 June
    );

    ;WITH d AS (
        SELECT CAST('2020-01-01' AS DATE) AS dt
        UNION ALL
        SELECT DATEADD(DAY, 1, dt) FROM d WHERE dt < '2032-12-31'
    )
    INSERT INTO wf.DimDate ([Date], [Year], [Quarter], [MonthNumber], [MonthName], [MonthYear], [WeekStart], [IsWeekday], [FinYear])
    SELECT
        dt,
        YEAR(dt),
        DATEPART(QUARTER, dt),
        MONTH(dt),
        DATENAME(MONTH, dt),
        FORMAT(dt, 'MMM yyyy'),
        DATEADD(DAY, -((DATEPART(WEEKDAY, dt) + @@DATEFIRST - 2) % 7), dt),
        CASE WHEN ((DATEPART(WEEKDAY, dt) + @@DATEFIRST - 2) % 7) < 5 THEN 1 ELSE 0 END,
        CASE WHEN MONTH(dt) >= 7 THEN YEAR(dt) + 1 ELSE YEAR(dt) END
    FROM d
    OPTION (MAXRECURSION 0);
END
GO

/* ===========================================================================
   Resource Manager operational tables: approvals, variations, invoices and the
   chase history that ties them together.
   =========================================================================== */

IF OBJECT_ID('wf.Approval', 'U') IS NULL
CREATE TABLE wf.Approval (
    ApprovalId          VARCHAR(40)   NOT NULL CONSTRAINT PK_Approval PRIMARY KEY,
    ContractorId        VARCHAR(40)   NOT NULL
        CONSTRAINT FK_Approval_Contractor REFERENCES wf.Contractor (ContractorId),
    ApprovalKind        VARCHAR(30)   NOT NULL CONSTRAINT CK_Approval_Kind
        CHECK (ApprovalKind IN ('new-engagement','extension','rate-change','hours-change','scope-change','po-increase','early-termination')),
    Reference           NVARCHAR(80)  NULL,
    ApprovalDescription NVARCHAR(MAX) NULL,
    ApprovalValue       DECIMAL(18,2) NULL,
    RaisedOn            DATE          NULL,
    RequiredBy          DATE          NULL,
    ApprovalState       VARCHAR(20)   NOT NULL CONSTRAINT CK_Approval_State
        CHECK (ApprovalState IN ('draft','submitted','with-approver','approved','rejected','withdrawn')),
    CurrentApprover     NVARCHAR(200) NULL,
    CurrentApproverRole NVARCHAR(200) NULL,
    /* Separate from RaisedOn so re-assigning an approver restarts the clock. */
    WithApproverSince   DATE          NULL,
    DecidedOn           DATE          NULL,
    Notes               NVARCHAR(MAX) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Approval_State')
CREATE INDEX IX_Approval_State ON wf.Approval (ApprovalState) INCLUDE (CurrentApprover, WithApproverSince, RequiredBy);
GO

IF OBJECT_ID('wf.Variation', 'U') IS NULL
CREATE TABLE wf.Variation (
    VariationId          VARCHAR(40)   NOT NULL CONSTRAINT PK_Variation PRIMARY KEY,
    ContractorId         VARCHAR(40)   NOT NULL
        CONSTRAINT FK_Variation_Contractor REFERENCES wf.Contractor (ContractorId) ON DELETE CASCADE,
    VariationType        VARCHAR(30)   NOT NULL CONSTRAINT CK_Variation_Type
        CHECK (VariationType IN ('extension','rate-change','hours-change','scope-change','early-termination')),
    Reference            NVARCHAR(80)  NULL,
    EffectiveFrom        DATE          NULL,
    RecordedOn           DATE          NULL,
    PreviousEndDate      DATE          NULL,
    NewEndDate           DATE          NULL,
    PreviousRate         DECIMAL(18,2) NULL,
    NewRate              DECIMAL(18,2) NULL,
    PreviousHoursPerWeek DECIMAL(6,2)  NULL,
    NewHoursPerWeek      DECIMAL(6,2)  NULL,
    ValueImpact          DECIMAL(18,2) NULL,
    ApprovalId           VARCHAR(40)   NULL
        CONSTRAINT FK_Variation_Approval REFERENCES wf.Approval (ApprovalId),
    Notes                NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('wf.Invoice', 'U') IS NULL
CREATE TABLE wf.Invoice (
    InvoiceId         VARCHAR(40)   NOT NULL CONSTRAINT PK_Invoice PRIMARY KEY,
    ContractorId      VARCHAR(40)   NOT NULL
        CONSTRAINT FK_Invoice_Contractor REFERENCES wf.Contractor (ContractorId),
    VendorId          VARCHAR(40)   NULL
        CONSTRAINT FK_Invoice_Vendor REFERENCES wf.Vendor (VendorId),
    InvoiceNumber     NVARCHAR(80)  NULL,
    PoNumber          NVARCHAR(80)  NULL,
    PeriodStart       DATE          NULL,
    PeriodEnd         DATE          NULL,
    HoursClaimed      DECIMAL(9,2)  NULL,
    AmountExGst       DECIMAL(18,2) NOT NULL CONSTRAINT DF_Invoice_Amount DEFAULT (0),
    ReceivedOn        DATE          NULL,
    SentForApprovalOn DATE          NULL,
    ApprovedOn        DATE          NULL,
    DueDate           DATE          NULL,
    PaidOn            DATE          NULL,
    InvoiceStatus     VARCHAR(20)   NOT NULL CONSTRAINT CK_Invoice_Status
        CHECK (InvoiceStatus IN ('expected','received','with-approver','approved','paid','disputed','on-hold')),
    Approver          NVARCHAR(200) NULL,
    DisputeReason     NVARCHAR(MAX) NULL,
    Notes             NVARCHAR(MAX) NULL,
    CONSTRAINT CK_Invoice_Period CHECK (PeriodEnd IS NULL OR PeriodStart IS NULL OR PeriodEnd >= PeriodStart)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoice_Status')
CREATE INDEX IX_Invoice_Status ON wf.Invoice (InvoiceStatus) INCLUDE (DueDate, AmountExGst, ContractorId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoice_DueDate')
CREATE INDEX IX_Invoice_DueDate ON wf.Invoice (DueDate);
GO

/* The chase history. One table for both parents, discriminated by ParentType,
   because the questions asked of it are always "how often did we chase this"
   and "who did we chase", never "join me to exactly one entity". */
IF OBJECT_ID('wf.Chase', 'U') IS NULL
CREATE TABLE wf.Chase (
    ChaseId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Chase PRIMARY KEY,
    ParentType VARCHAR(20)   NOT NULL CONSTRAINT CK_Chase_Parent
        CHECK (ParentType IN ('approval','invoice')),
    ParentId   VARCHAR(40)   NOT NULL,
    ChaseDate  DATE          NOT NULL,
    Channel    VARCHAR(20)   NOT NULL CONSTRAINT CK_Chase_Channel
        CHECK (Channel IN ('email','call','teams','in-person')),
    ChasedWho  NVARCHAR(200) NULL,
    Note       NVARCHAR(MAX) NULL,
    Outcome    NVARCHAR(MAX) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Chase_Parent')
CREATE INDEX IX_Chase_Parent ON wf.Chase (ParentType, ParentId, ChaseDate DESC);
GO
