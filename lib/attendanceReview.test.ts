import {expect,it} from 'vitest'
import * as XLSX from 'xlsx'
import {sumAttendanceHours,attendanceHourWarnings,attendanceNeedsReview,mergeAttendanceRows,type AttendanceRow} from './attendance'
import {readFarmAttendanceBatch} from './attendanceBatch'
import {newPayrollLine,hourlyAmount} from './payrollPreparation'
const row:AttendanceRow={worker_id:'a',work_date:'2026-08-21',normal_hours:32,overtime_hours:0,entry_source:'excel',source_filename:'source.xlsx'}
it('accepts original values, exposes review and invalidates confirmation after a change',()=>{
 expect(attendanceHourWarnings(row).join()).toContain('24')
 expect(attendanceNeedsReview(row)).toBe(true)
 expect(attendanceNeedsReview({...row,needs_review:false,review_status:'confirmed'})).toBe(false)
 expect(attendanceNeedsReview(mergeAttendanceRows([{...row,needs_review:false,review_status:'confirmed'}],[{...row,normal_hours:33}]).rows[0])).toBe(true)
 expect(attendanceHourWarnings({...row,normal_hours:17.5824})).toHaveLength(1)
})
it('consolidates 16 + 16 from the source and keeps a nonblocking warning and source references',()=>{
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([])
 sheet.C2={t:'s',v:'QUINZAINE DU 16/08/2026 AU 31/08/2026'}
 for(let day=16;day<=31;day++)sheet[XLSX.utils.encode_cell({r:5,c:day-16+3})]={t:'n',v:day}
 XLSX.utils.sheet_add_aoa(sheet,[['EMPLOYE','N',null,null,null,null,null,16],['','S'],['EMPLOYE','N',null,null,null,null,null,16],['','S']],{origin:'B10'})
 sheet['!ref']='B2:S13'
 XLSX.utils.book_append_sheet(book,sheet,'Source')
 const workers=[{id:'a',farm_id:'f',first_name:'',last_name:'EMPLOYE',matricule:'1',is_active:true}]
 const result=readFarmAttendanceBatch(XLSX.write(book,{type:'array',bookType:'xlsx'}),'source.xlsx',workers)[0]
 expect(result.issues).toEqual([])
 expect(result.rows.find(x=>x.work_date==='2026-08-21')?.normal_hours).toBe(32)
 expect(result.warnings?.[0]).toMatchObject({date:'2026-08-21',sources:['Source!10','Source!12']})
})
it('never feeds unreviewed attendance into payroll even if a stale client marks the period validated',()=>{
 const worker={id:'a',farm_id:'f',first_name:'',last_name:'EMPLOYE',matricule:'1',is_active:true,normal_hourly_rate:10,overtime_hourly_rate:0,is_declared:false}
 const period={id:'p',domain_id:'d',farm_id:'f',start_date:'2026-08-16',end_date:'2026-08-31',revision:1,status:'validated' as const,validated_at:null}
 expect(newPayrollLine(worker,{period,rows:[row]}).normal_hours).toBeNull()
 expect(newPayrollLine(worker,{period,rows:[{...row,needs_review:false,review_status:'confirmed'}]}).normal_hours).toBe(32)
 expect(hourlyAmount(17.5824,10)).toBe(175.82)
})

it('consolidates decimal hours without introducing artificial precision alerts',()=>{
 expect(sumAttendanceHours([.1,.2,null])).toBe(.3)
 expect(sumAttendanceHours([null,null])).toBeNull()
 expect(sumAttendanceHours([17.5824,0])).toBe(17.5824)
 expect(sumAttendanceHours([1e-7,1e-7])).toBe(2e-7)
})

it('keeps review provenance for blank imports and reopens review for a new source',()=>{
 const confirmed={...row,needs_review:false,review_status:'confirmed' as const,source_references:['Source!22']}
 const blank=mergeAttendanceRows([confirmed],[{...row,normal_hours:null,overtime_hours:null,source_filename:'blank.xlsx'}]).rows[0]
 expect(blank.source_filename).toBe('source.xlsx')
 expect(blank.needs_review).toBe(false)
 const changed=mergeAttendanceRows([confirmed],[{...row,source_filename:'new-source.xlsx'}]).rows[0]
 expect(changed.needs_review).toBe(true)
})
