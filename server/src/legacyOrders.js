// Reconciliation of historical orders. Never infer ownership from email alone.
// An administrator must review independent evidence and explicitly approve the link.
import sql from 'mssql';

import {validateLegacyOwnerLink} from './domain/legacyOwnerPolicy.js';
export {validateLegacyOwnerLink} from './domain/legacyOwnerPolicy.js';
const issue = code => Object.assign(new Error(code), {code});

export function attachLegacyOrders(pool, repo) {
  Object.assign(repo, {
    async legacyOwnerCandidates(orderId) {
      const order = (await pool.request().input('id', sql.Int, orderId)
        .query(`SELECT MaDonHang AS id,MaNguoiDung AS userId,TenKhachHang AS name,
                  EmailKhachHang AS email,TrangThai AS status
                FROM dbo.DonHang WHERE MaDonHang=@id`)).recordset[0];
      if (!order) return null;
      // A matching email is only a *candidate*, never sufficient to change the order.
      const candidates = order.userId == null ? (await pool.request()
        .input('email', sql.NVarChar(254), order.email)
        .query(`SELECT MaNguoiDung AS id,HoTen AS name,Email AS email,TrangThai AS status
          FROM dbo.NguoiDung WHERE VaiTro='user'
            AND LOWER(LTRIM(RTRIM(Email)))=LOWER(LTRIM(RTRIM(@email)))
          ORDER BY MaNguoiDung`)).recordset : [];
      return { order, candidates, requiresEvidence: true };
    },

    async linkLegacyOwner(orderId, data, actor) {
      const values = validateLegacyOwnerLink(data);
      if (!values) throw issue('invalid');
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        const order = (await new sql.Request(tx).input('id', sql.Int, orderId)
          .query(`SELECT MaDonHang AS id,MaNguoiDung AS userId,EmailKhachHang AS email
            FROM dbo.DonHang WITH (UPDLOCK,HOLDLOCK) WHERE MaDonHang=@id`)).recordset[0];
        if (!order) throw issue('not_found');
        if (order.userId != null) throw issue('already_linked');
        const candidates = (await new sql.Request(tx).input('email', sql.NVarChar(254), order.email)
          .query(`SELECT MaNguoiDung AS id FROM dbo.NguoiDung WITH (HOLDLOCK)
            WHERE VaiTro='user' AND LOWER(LTRIM(RTRIM(Email)))=LOWER(LTRIM(RTRIM(@email)))`)).recordset;
        if (candidates.length !== 1 || candidates[0].id !== values.userId)
          throw issue(candidates.length > 1 ? 'ambiguous_owner' : 'email_mismatch');
        const upd = await new sql.Request(tx).input('id', sql.Int, orderId)
          .input('uid', sql.Int, values.userId)
          .query(`UPDATE dbo.DonHang SET MaNguoiDung=@uid
                  WHERE MaDonHang=@id AND MaNguoiDung IS NULL`);
        if (upd.rowsAffected[0] !== 1) throw issue('already_linked');
        await new sql.Request(tx)
          .input('id', sql.Int, orderId).input('uid', sql.Int, values.userId)
          .input('type', sql.VarChar(30), values.evidenceType)
          .input('ref', sql.NVarChar(120), values.evidenceRef)
          .input('note', sql.NVarChar(500), values.note)
          .input('actor', sql.NVarChar(254), actor)
          .query(`INSERT dbo.XacMinhChuDonHang
            (MaDonHang,MaNguoiDung,LoaiBangChung,MaBangChung,LyDo,NguoiXacMinh)
            VALUES (@id,@uid,@type,@ref,@note,@actor)`);
        await new sql.Request(tx).input('actor', sql.NVarChar(254), actor)
          .input('target', sql.NVarChar(254), `order:${orderId}`)
          .input('after', sql.NVarChar(40), String(values.userId))
          .query(`INSERT dbo.NhatKyQuanTri(Loai,DoiTuong,NguoiThucHien,GiaTriCu,GiaTriMoi)
                  VALUES('order_owner_link',@target,@actor,NULL,@after)`);
        // Deliberately do NOT update GiaoDich.NguonXacNhan or call grantPaidOrder.
        await tx.commit();
        return { orderId, userId: values.userId, ownership: 'manual_verified', creditsGranted: false };
      } catch (e) {
        await tx.rollback().catch(() => {});
        throw e;
      }
    },
  });
}
