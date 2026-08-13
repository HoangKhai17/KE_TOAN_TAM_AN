import api from '../api/axios'

// Xuất Excel DÙNG CHUNG: gửi dữ liệu đã tính sẵn lên backend → backend format theo
// style chuẩn (Calibri 11 + border + header đậm + freeze…) → tải file về.
//
//   exportXlsx({
//     filename: 'bang_tong_hop_2026-08-13',           // không cần .xlsx
//     sheets: [{
//       name: 'Theo dõi phát sinh Thuế',
//       columns: [{ label, width?, align?, type?: 'text'|'number'|'date', thousands?: bool }],
//       rows: [[...]],                                  // giá trị đúng kiểu (số là số, ngày 'YYYY-MM-DD')
//       totalRow?: [...],  totalPosition?: 'top'|'bottom',
//     }],
//   })
export async function exportXlsx({ filename = 'export', sheets = [] }) {
  const blob = await api.post('/export/xlsx', { filename, sheets }, { responseType: 'blob' }).then((r) => r.data)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
