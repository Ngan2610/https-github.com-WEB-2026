export default function CookingInsights({data}) {
  if(!data) return null;
  return <section aria-label="Thông tin nấu ăn" className="panel">
    <h3>Nguyên liệu và các bước</h3>
    <p className="fine">{data.note}</p>
    <ul>{data.ingredients?.map(x=><li key={x.name}>{x.name} — {x.evidence}</li>)}</ul>
    <ol>{data.steps?.map((x,i)=><li key={i}>{x.start!=null?`[${x.start.toFixed(1)}s] `:''}{x.text}</li>)}</ol>
    <h4>Quy đổi đơn vị</h4>
    {data.conversions?.length?<ul>{data.conversions.map((x,i)=><li key={i}>{x.from} → {x.to}</li>)}</ul>:<p>Không có đơn vị cần quy đổi trong lời thoại.</p>}
    <h4>Thuật ngữ ẩm thực</h4>
    <ul>{data.glossary?.map((x,i)=><li key={i}>{x.source} → {x.target} ({x.language})</li>)}</ul>
  </section>;
}
