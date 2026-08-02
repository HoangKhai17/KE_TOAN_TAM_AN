import { useState } from 'react'
import { MapPin, FileText } from 'lucide-react'
import CompanyLocationsCard from './CompanyLocationsCard'
import CompanyContractsCard from './CompanyContractsCard'
import s from './companies.module.css'

// Khối có 2 tab: "Trụ sở chính / địa điểm kinh doanh" | "Hợp đồng dịch vụ"
// Đặt ngay dưới "Thông tin khách hàng" trong tab Tổng quan.
export default function CompanyOverviewTables({ companyId, canEdit = true }) {
  const [tab, setTab] = useState('locations')
  return (
    <div className={`${s.infoCard} ${s.overviewTablesCard} ${canEdit ? s.overviewTablesCardEditable : ''}`}>
      <div className={s.infoCardHeader}>
        <div className={s.overviewTableTabs}>
          <button
            className={`${s.overviewTableTab} ${tab === 'locations' ? s.overviewTableTabActive : ''}`}
            onClick={() => setTab('locations')}
          >
            <MapPin size={14} /> Trụ sở chính / địa điểm kinh doanh
          </button>
          <button
            className={`${s.overviewTableTab} ${tab === 'contracts' ? s.overviewTableTabActive : ''}`}
            onClick={() => setTab('contracts')}
          >
            <FileText size={14} /> Hợp đồng dịch vụ
          </button>
        </div>
      </div>
      <div className={s.infoCardBody}>
        {tab === 'locations'
          ? <CompanyLocationsCard companyId={companyId} canEdit={canEdit} />
          : <CompanyContractsCard companyId={companyId} canEdit={canEdit} />}
      </div>
    </div>
  )
}
