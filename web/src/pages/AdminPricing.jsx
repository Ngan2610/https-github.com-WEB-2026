import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { manageApi } from '../api/workflows.js';
import usePricingPolicy from '../hooks/usePricingPolicy.js';
import { formatMinorMoney } from '../shared/format.js';
import './AdminPricing.css';

const currencies={VND:'Việt Nam (VND)',USD:'Đô la Mỹ (USD) — tham khảo',CNY:'Nhân dân tệ (CNY) — tham khảo'};
const priceFields=[
  {key:'uploadMinor',label:'Giá một video tải lên',max:100000000},
  {key:'translationMinor',label:'Giá một video dịch ra',max:100000000},
  {key:'maxVideos',label:'Giới hạn video mỗi lượt',min:1,max:5000},
  {key:'maxTranslations',label:'Số bản dịch tối đa / video',min:1,max:3},
  {key:'annualDiscountPct',label:'Giảm giá năm (%)',max:90},
];
const blankPack=()=>({name:'',uploads:'3',outs:'3',durationDays:'',enabled:true,sortOrder:'10'});
const packDraft=p=>({name:p.name,uploads:String(p.uploads),outs:String(p.outs),
  durationDays:p.durationDays==null?'':String(p.durationDays),enabled:p.enabled,sortOrder:String(p.sortOrder)});
const numberFields=raw=>({name:raw.name.trim(),uploads:Number(raw.uploads),outs:Number(raw.outs),
  durationDays:raw.durationDays===''?null:Number(raw.durationDays),enabled:raw.enabled,sortOrder:Number(raw.sortOrder)});
const formatWhen=date=>date?new Date(date).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const errors={invalid_price:'Thông số giá không hợp lệ.',reason_required:'Vui lòng nhập lý do thay đổi giá.',price_changed:'Bảng giá vừa được sửa ở nơi khác. Vui lòng tải lại trước khi lưu.',
  pack_changed:'Gói vừa được thay đổi ở nơi khác. Tải lại danh sách trước khi sửa.',
  pack_exceeds_pricing_limits:'Số lượt trong gói vượt giới hạn đang thiết lập ở bảng giá.',
  invalid_pack:'Thông tin gói không hợp lệ. Kiểm tra tên, số lượt và thứ tự.',
  pack_version_required:'Vui lòng tải lại thông tin gói trước khi lưu.',
  not_found:'Không tìm thấy gói dịch vụ.',forbidden:'Tài khoản không đủ quyền quản trị.'};
const readableError=e=>errors[e?.code]||'Không lưu được dữ liệu vào SQL Server. Kiểm tra API rồi thử lại.';

export default function AdminPricing(){
  const {pricing,error:loadError,refresh}=usePricingPolicy();
  const [currency,setCurrency]=useState('VND');
  const row=pricing?.currencies?.find(x=>x.currency===currency);
  const [draft,setDraft]=useState(null);
  const draftKey=useRef('');
  const [reason,setReason]=useState('');
  const [savingPrice,setSavingPrice]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [history,setHistory]=useState([]);
  const [packHistory,setPackHistory]=useState([]);
  const [editing,setEditing]=useState(null);
  const [original,setOriginal]=useState(null);
  const [packForm,setPackForm]=useState(null);
  const [savingPack,setSavingPack]=useState(false);

  useEffect(()=>{
    const key=currency+':'+row?.version;
    if(row && key!==draftKey.current){draftKey.current=key;setDraft({...row});}
  },[currency,row]);
  useEffect(()=>{
    Promise.allSettled([manageApi.pricingHistory(),manageApi.packHistory()]).then(results=>{
      if(results[0].status==='fulfilled') setHistory(results[0].value.history||[]);
      if(results[1].status==='fulfilled') setPackHistory(results[1].value.history||[]);
    });
  },[]);

  const activeDraft=draft?.currency===currency?draft:null;
  const changed=activeDraft&&row&&priceFields.some(({key})=>Number(activeDraft[key])!==row[key]);
  const resetPrice=()=>{setDraft(row?{...row}:null);setReason('');setError('');};
  async function reloadAll(){
    await refresh();
    const [prices,packs]=await Promise.allSettled([manageApi.pricingHistory(),manageApi.packHistory()]);
    if(prices.status==='fulfilled')setHistory(prices.value.history||[]);
    if(packs.status==='fulfilled')setPackHistory(packs.value.history||[]);
  }
  async function savePrice(e){
    e.preventDefault();if(!changed||savingPrice)return;
    if(!reason.trim()){setError('Vui lòng nhập lý do thay đổi giá.');return;}
    if(!window.confirm('Giá mới chỉ áp dụng cho đơn hàng tạo sau khi lưu. Bạn xác nhận?'))return;
    setSavingPrice(true);setNotice('');setError('');
    try {
      const changes=Object.fromEntries(priceFields.map(({key})=>[key,Number(activeDraft[key])]));
      await manageApi.updatePricing({currency,version:row.version,...changes,reason:reason.trim()});
      await reloadAll();setReason('');setNotice('Đã lưu bảng giá vào SQL Server. Các đơn hàng cũ giữ nguyên giá đã chụp.');
    } catch(e) {setError(readableError(e));await refresh();}
    finally {setSavingPrice(false);}
  }
  function newPack(){
    setEditing('new');setOriginal(null);setPackForm(blankPack());setError('');setNotice('');
    document.getElementById('adm-pack-edit')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function editPack(pack){
    setEditing(pack.id);setOriginal(pack);setPackForm(packDraft(pack));setError('');setNotice('');
    document.getElementById('adm-pack-edit')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function savePack(e){
    e.preventDefault();if(savingPack||!packForm)return;
    const input=numberFields(packForm);
    if(!input.name||input.name.length>100||!Number.isSafeInteger(input.uploads)||input.uploads<1||input.uploads>5000||
       !Number.isSafeInteger(input.outs)||input.outs<1||input.outs>input.uploads*3||
       !Number.isSafeInteger(input.sortOrder)||input.sortOrder<0||input.sortOrder>10000||
       (input.durationDays!==null&&(!Number.isSafeInteger(input.durationDays)||input.durationDays<1||input.durationDays>3650))){
      setError('Dữ liệu gói chưa hợp lệ: tối đa 5.000 video, 3 bản dịch/video, thứ tự 0–10.000.');return;
    }
    if(!window.confirm(editing==='new'?'Tạo gói dịch vụ mới trong SQL Server?':'Lưu thay đổi của gói này vào SQL Server?'))return;
    setSavingPack(true);setError('');setNotice('');
    try {
      if(editing==='new')await manageApi.createPack(input);
      else await manageApi.updatePack(editing,{...input,expected:original});
      await reloadAll();setEditing(null);setOriginal(null);setPackForm(null);
      setNotice('Đã lưu gói dịch vụ vào SQL Server. Giao diện Web/Mobile sẽ đọc dữ liệu mới.');
    }catch(e){setError(readableError(e));}
    finally {setSavingPack(false);}
  }
  async function togglePack(pack){
    const action=pack.enabled?'Ẩn':'Hiển thị';
    if(!window.confirm(`${action} gói "${pack.name}"? Các đơn hàng đã tạo sẽ không bị thay đổi.`))return;
    setSavingPack(true);setError('');setNotice('');
    try {
      await manageApi.updatePack(pack.id,{...pack,enabled:!pack.enabled,expected:pack});
      await reloadAll();
      if(editing===pack.id){setEditing(null);setOriginal(null);setPackForm(null);}
      setNotice(`Đã ${pack.enabled?'ẩn':'hiển thị'} gói "${pack.name}".`);
    }catch(e){setError(readableError(e));}
    finally {setSavingPack(false);}
  }
  const packs=pricing?.packs||[];
  return <div className="adm-pricing">
    <div className="adm-head"><div><h1>Gói dịch vụ & bảng giá</h1>
      <p>Quản lý đơn giá, gói video và lịch sử thay đổi trực tiếp trên SQL Server.</p></div>
      <Link to="/pricing" className="btn btn-sm">Xem bảng giá khách hàng</Link>
    </div>
    {loadError&&<p className="adm-price-alert" role="alert">{loadError}</p>}
    {error&&<p className="adm-price-alert" role="alert">{error}</p>}
    {notice&&<p className="adm-price-success" role="status">{notice}</p>}
    <section className="panel" aria-labelledby="adm-unit-heading">
      <div className="adm-price-section-heading"><div><h2 id="adm-unit-heading">Đơn giá và giới hạn sử dụng</h2>
        <p className="fine">VND dùng cho payOS; USD/CNY chỉ để tham khảo khi demo. Đơn hàng cũ giữ nguyên giá snapshot.</p></div></div>
      <label className="adm-price-currency">Loại tiền
        <select value={currency} onChange={e=>{setCurrency(e.target.value);setNotice('');setError('');}}>
          {Object.entries(currencies).map(([key,name])=><option key={key} value={key}>{name}</option>)}
        </select>
      </label>
      {row&&activeDraft?<form onSubmit={savePrice} aria-label="Cập nhật giá" className="adm-price-form">
        <p className="fine">Phiên bản <strong>{row.version}</strong> · Cập nhật lúc {formatWhen(row.updatedAt)}</p>
        <div className="adm-price-fields">
          {priceFields.map(({key,label,min=0,max})=><label className="adm-price-field" key={key}>{label}
            <input type="number" required min={min} max={max} step="1" value={activeDraft[key]}
              onChange={e=>setDraft(old=>({...old,[key]:e.target.value}))}/>
          </label>)}
        </div>
        <p className="fine">Đơn giá hiện tại: <strong>{formatMinorMoney(row.uploadMinor,currency)}</strong> / video đăng · <strong>{formatMinorMoney(row.translationMinor,currency)}</strong> / bản dịch</p>
        <label className="adm-price-field">Lý do chỉnh sửa giá
          <textarea required rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: cập nhật giá dịch vụ cho kỳ mới"/>
        </label>
        <div className="adm-price-actions">
          <button className="btn btn-primary" type="submit" disabled={!changed||savingPrice||!reason.trim()}>{savingPrice?'Đang lưu…':'Lưu bảng giá'}</button>
          <button className="btn" type="button" disabled={savingPrice} onClick={resetPrice}>Hoàn tác</button>
          <button className="btn" type="button" disabled={savingPrice} onClick={reloadAll}>Tải lại</button>
        </div>
      </form>:<p className="fine">Đang tải cấu hình giá từ SQL Server…</p>}
    </section>
    <section className="panel" aria-labelledby="adm-pack-heading">
      <div className="adm-price-section-heading"><div><h2 id="adm-pack-heading">Danh sách gói dịch vụ</h2>
        <p className="fine">{packs.length} gói trong SQL · Gói là lựa chọn nhanh theo số video; gói bị ẩn không hiện với khách. Đơn hàng cũ không thay đổi.</p></div>
        <button className="btn btn-primary" type="button" onClick={newPack}>+ Thêm gói mới</button>
      </div>
      <div className="adm-table-wrap"><table className="adm-table"><thead><tr>
        <th>Mã</th><th>Tên gói</th><th>Video đăng</th><th>Bản dịch</th><th>Thời hạn</th><th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th>
      </tr></thead><tbody>{packs.map(pack=><tr key={pack.id}>
        <td>{pack.id}</td><td><strong>{pack.name}</strong></td><td>{pack.uploads}</td><td>{pack.outs}</td>
        <td>{pack.durationDays?`${pack.durationDays} ngày`:'Theo lượt'}</td><td>{pack.sortOrder}</td>
        <td><span className="adm-price-state" data-state={pack.enabled?'active':'hidden'}>{pack.enabled?'Đang hiển thị':'Đã ẩn'}</span></td>
        <td><div className="adm-price-actions"><button className="btn btn-sm" type="button" onClick={()=>editPack(pack)} disabled={savingPack}>Sửa</button>
          <button className="btn btn-sm" type="button" disabled={savingPack} onClick={()=>togglePack(pack)}>{pack.enabled?'Ẩn':'Hiện'}</button></div></td>
      </tr>)}{packs.length===0&&<tr><td colSpan={8}>Chưa có gói nào trong SQL Server.</td></tr>}</tbody></table></div>
      {packForm&&<form id="adm-pack-edit" className="adm-pack-editor" onSubmit={savePack} aria-label="Chỉnh sửa gói dịch vụ">
        <h3>{editing==='new'?'Thêm gói dịch vụ':`Chỉnh sửa gói #${editing}`}</h3>
        <div className="adm-price-fields">
          <label className="adm-price-field">Tên gói<input value={packForm.name} maxLength={100} required onChange={e=>setPackForm(old=>({...old,name:e.target.value}))}/></label>
          <label className="adm-price-field">Số video đăng<input type="number" min="1" max="5000" required value={packForm.uploads} onChange={e=>setPackForm(old=>({...old,uploads:e.target.value}))}/></label>
          <label className="adm-price-field">Số bản dịch<input type="number" min="1" max="15000" required value={packForm.outs} onChange={e=>setPackForm(old=>({...old,outs:e.target.value}))}/></label>
          <label className="adm-price-field">Thời hạn tham khảo (ngày; bỏ trống nếu không dùng)<input type="number" min="1" max="3650" value={packForm.durationDays} onChange={e=>setPackForm(old=>({...old,durationDays:e.target.value}))}/></label>
          <label className="adm-price-field">Thứ tự hiển thị<input type="number" min="0" max="10000" required value={packForm.sortOrder} onChange={e=>setPackForm(old=>({...old,sortOrder:e.target.value}))}/></label>
          <label className="adm-price-field">Trạng thái<select value={packForm.enabled?'visible':'hidden'} onChange={e=>setPackForm(old=>({...old,enabled:e.target.value==='visible'}))}>
            <option value="visible">Đang hiển thị</option><option value="hidden">Ẩn khỏi trang khách</option>
          </select></label>
        </div>
        <div className="adm-price-actions"><button className="btn btn-primary" type="submit" disabled={savingPack}>{savingPack?'Đang lưu…':'Lưu gói'}</button>
          <button className="btn" type="button" disabled={savingPack} onClick={()=>{setEditing(null);setOriginal(null);setPackForm(null);setError('');}}>Hủy</button></div>
      </form>}
    </section>
    <section className="panel"><h2>Lịch sử thay đổi bảng giá</h2>
      <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Thời điểm (VN)</th><th>Tiền tệ</th><th>Phiên bản</th><th>Người sửa</th><th>Lý do</th></tr></thead><tbody>
        {history.map(h=><tr key={h.id}><td>{formatWhen(h.changedAt)}</td><td>{h.currency}</td><td>{h.previousVersion} → {h.version}</td><td>{h.changedBy}</td><td>{h.reason}</td></tr>)}
        {history.length===0&&<tr><td colSpan={5}>Chưa có lần chỉnh sửa đơn giá nào được ghi nhận.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="panel"><h2>Nhật ký thao tác gói dịch vụ</h2>
      <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Thời điểm (VN)</th><th>Thao tác</th><th>Đối tượng</th><th>Người thực hiện</th><th>Trước</th><th>Sau</th></tr></thead><tbody>
        {packHistory.map(h=><tr key={h.id}><td>{formatWhen(h.changedAt)}</td><td>{h.action.replace('pricing_pack_','')}</td><td>{h.target}</td><td>{h.changedBy}</td><td>{h.previous||'—'}</td><td>{h.next||'—'}</td></tr>)}
        {packHistory.length===0&&<tr><td colSpan={6}>Chưa có lần thêm, sửa hoặc ẩn gói nào được ghi nhận.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
