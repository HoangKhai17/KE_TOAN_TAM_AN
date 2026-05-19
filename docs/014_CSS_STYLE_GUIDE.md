# 014 - Quy Tac Viet CSS Va To Chuc Design Token

## Muc tieu

Tai lieu nay quy dinh cach viet CSS cho frontend de giao dien dong bo, de bao tri va tranh lap lai cac gia tri nhu mau sac, font, spacing, border, shadow truc tiep trong tung the JSX/HTML.

Nguyen tac chinh:

- Khong viet style truc tiep vao JSX neu co the tach thanh class CSS.
- Khong lap lai ma mau, font size, spacing, radius, shadow bang gia tri raw neu da co token dung chung.
- Moi gia tri thiet ke lap lai tu 2 lan tro len phai duoc dua ve CSS variable hoac class tai su dung.
- Component chi nen chua logic hien thi; CSS module chiu trach nhiem ve layout, mau sac, trang thai va responsive.

## Nguon token dung chung

File token chinh cua frontend:

```text
frontend/src/styles/tokens.css
```

Luu y quan trong: `tokens.css` phai la bang token moi, lay theo giao dien sang, dam, tuoi dang dung tren Dashboard, Tasks va Companies. Khong mac dinh dung lai palette/font cu neu no khong con khop voi giao dien hien tai.

Huong palette hien tai:

- Primary blue: `#2563eb`, `#1d4ed8`, `#3b82f6`, tint `#eff6ff`, border `#dbeafe`, ring `#93c5fd`.
- Success green: `#059669`, `#10b981`, tint `#d1fae5`, soft `#ecfdf5`.
- Danger red: `#dc2626`, `#ef4444`, tint `#fee2e2`, soft `#fff1f1`.
- Warning orange/amber: `#ea580c`, `#f97316`, `#d97706`, tint `#fff7ed`, `#fef3c7`.
- Purple: `#7c3aed`, `#6d28d9`, tint `#ede9fe`, `#faf5ff`.
- Neutral text/surface: `#0f172a`, `#1e293b`, `#334155`, `#64748b`, `#94a3b8`, `#f8fafc`, `#f1f5f9`, `#e2e8f0`, `#ffffff`.
- Font mac dinh uu tien `Inter`, fallback `Montserrat` va system UI.

Tat ca CSS module phai uu tien dung cac bien trong `:root`:

```css
color: var(--color-text);
background: var(--color-surface);
border-color: var(--color-border-muted);
font-size: var(--fs-sm);
font-weight: var(--fw-semibold);
border-radius: var(--radius-md);
box-shadow: var(--shadow-sm);
transition: background var(--duration-fast) var(--ease-standard);
```

Neu can mau/spacing/radius moi:

1. Kiem tra token hien co truoc.
2. Neu token hien co la palette/font cu va khong khop UI moi, cap nhat token truoc khi refactor component.
3. Neu thuc su la gia tri dung chung, them vao `tokens.css`.
4. Dat ten theo y nghia su dung, khong theo vi tri man hinh. Vi du: `--color-danger-bg`, `--shadow-surface`.

## Quy tac viet CSS

### 1. Khong viet inline style cho UI thong thuong

Khong nen:

```jsx
<button style={{ background: '#2563eb', color: '#fff', padding: '7px 16px' }}>
  Luu
</button>
```

Nen:

```jsx
<button className={s.primaryButton}>Luu</button>
```

```css
.primaryButton {
  padding: var(--space-3) var(--space-7);
  background: var(--color-info);
  color: var(--color-white);
}
```

### 2. Dung class cho variant va state

Khong tao object style theo trang thai neu trang thai co tap gia tri co dinh.

Khong nen:

```jsx
<span style={statusStyle[status]}>{label}</span>
```

Nen:

```jsx
<span className={`${s.badge} ${s[`status_${status}`]}`}>{label}</span>
```

```css
.badge {
  display: inline-flex;
  border-radius: var(--radius-pill);
}

.status_pending {
  background: var(--color-border-muted);
  color: var(--color-text-soft);
}
```

### 3. Dung CSS variable cuc bo cho gia tri dong

Neu gia tri phu thuoc vao du lieu nhung van can CSS quan ly layout/state, dung CSS variable cuc bo tren element cha.

Chap nhan:

```jsx
<div className={s.kpiCard} style={{ '--kpi-accent': accent }}>
  ...
</div>
```

```css
.kpiCard {
  border-left-color: var(--kpi-accent);
}
```

Chi dung cach nay khi gia tri la du lieu dong hoac thu vien yeu cau. Khong dung de thay the token co san.

### 4. Gioi han inline style cho thu vien chart/canvas/editor

Mot so thu vien nhu Recharts yeu cau object prop cho cau hinh truc tiep:

```jsx
<XAxis tick={CHART_AXIS_TICK} />
<AreaChart margin={CHART_MARGIN} />
```

Quy tac:

- Khong viet object literal truc tiep trong JSX neu lap lai.
- Dua cau hinh chart ve constant co ten ro rang.
- Mau chart phai lay tu token/constant dung chung, khong rai rac trong JSX.

### 5. Dat ten class theo vai tro giao dien

Nen dat ten theo y nghia thanh phan:

```css
.chartPanel
.chartHeader
.priorityBadge
.dueTodayCard
```

Khong dat ten theo mau hoac vi tri tam thoi:

```css
.blueBox
.leftThing
.bigText2
```

### 6. To chuc CSS module

Moi page/component lon nen co file CSS module rieng:

```text
Dashboard.jsx
Dashboard.module.css
```

Thu tu nen dung trong CSS module:

1. Layout tong quan cua page/component.
2. Header/action/filter.
3. Component block chinh.
4. State va variant.
5. Animation.
6. Responsive.

### 7. Khong lap lai magic number

Neu mot gia tri spacing/radius/font-size xuat hien nhieu lan, dung token:

```css
gap: var(--space-5);
border-radius: var(--radius-lg);
font-size: var(--fs-sm);
```

Chi giu magic number khi no gan voi yeu cau layout dac thu, vi du chieu cao chart `280px`.

### 8. Responsive nam trong CSS

Khong xu ly responsive bang inline style trong JSX. Tat ca breakpoint, grid, wrap, min/max width nam trong CSS module.

```css
@media (min-width: 1024px) {
  .chartsRow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

## Checklist truoc khi merge CSS

- JSX khong con inline style cho UI thong thuong.
- Mau, font, radius, shadow, spacing uu tien dung `var(--...)`.
- Token phai khop palette sang/dam/tuoi hien tai, khong dung lai mau cu chi vi da ton tai trong `tokens.css`.
- Variant/status/priority duoc tach thanh class.
- Cau hinh chart lap lai duoc dua ve constant.
- Component khong lap lai object style giong nhau.
- Build frontend thanh cong.

## Ap dung cho Dashboard

Dashboard la man hinh dau tien can uu tien refactor:

- KPI card dung class variant va CSS variable cuc bo cho accent dong.
- Priority/status badge dung class theo key, khong dung object style.
- Tooltip va icon state dung class CSS thay vi inline style.
- Mau chart va cau hinh Recharts dung constant tap trung.
- CSS module dung token tu `tokens.css` cho font, mau, spacing, radius, shadow.
