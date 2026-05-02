export default function TerminosPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundImage: `url('/textura.png')`,
        backgroundColor: '#d0d0d0',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px'
      }}
    >
      <div
        className="no-scrollbar"
        style={{
          width: '100%',
          maxWidth: '600px',
          backgroundColor: '#ffffff',
          border: '5px solid #888888',
          borderRadius: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}
      >
        <div
          style={{
            padding: '50px 50px',
            color: '#000000',
            fontFamily: 'Arial, sans-serif'
          }}
        >

          {/* HEADER */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{ color: '#666666', fontSize: '14px', fontWeight: '500', margin: '0' }}>MOVI</p>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#000000', marginTop: '8px', margin: '8px 0 0 0' }}>
              TÉRMINOS Y CONDICIONES DE USO
            </h1>
            <p style={{ color: '#666666', marginTop: '8px', fontSize: '16px', margin: '8px 0 0 0' }}>
              Plataforma MOVi
            </p>
          </div>

          {/* INTRO */}
          <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '16px' }}>
            Los presentes <strong>Términos y Condiciones</strong> regulan el acceso y uso de la aplicación móvil y servicios web de <strong>MOVi Technology E.A.S</strong>. Al registrarse y utilizar la plataforma, usted acepta de manera expresa todos los puntos aquí expuestos. Si no está de acuerdo, deberá abstenerse de utilizar los servicios.
          </p>

          {/* 1 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>1. NATURALEZA DEL SERVICIO</h2>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              MOVi es una empresa de tecnología que proporciona una plataforma digital para conectar a personas que quieran un servicio de transporte ("pasajero") con terceros proveedores independientes que ofrecen dicho servicio ("conductores").
            </p>
            <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0', fontSize: '16px' }}>
              MOVi NO ES UNA EMPRESA DE TRANSPORTE
            </p>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              No posee vehículos propios, ni actúa como empleador de los conductores. El contrato de transporte se celebra exclusivamente entre el pasajero y conductor.
            </p>
          </div>

          {/* 2 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>2. REGISTRO Y CUENTA DE USUARIO</h2>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• CAPACIDAD</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>El usuario debe ser mayor de 18 años y contar con capacidad legal para contratar.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• VERACIDAD</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>El usuario se compromete a proporcionar información real, exacta y actualizada (Nombre, C.I, Teléfono, correo).</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• SEGURIDAD</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>La cuenta es personal e intransferible. El usuario es el único responsable de mantener la confidencialidad de sus credenciales.</p>
            </div>
          </div>

          {/* 3 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>3. OBLIGACIONES DEL USUARIO</h2>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• CONDUCTA</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>El usuario debe tratar con respeto al Conductor y mantener el orden dentro del vehículo.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• USO LÍCITO</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>Se prohibe el transporte de sustancias ilegales, armas o cualquier objeto prohibido por las leyes de la República del Paraguay.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• DAÑOS</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>El pasajero será responsable del costo de reparación de daños en el vehículo si provocase durante el viaje daños al vehículo del conductor.</p>
            </div>
          </div>

          {/* 4 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>4. TARIFAS Y PAGOS</h2>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• CÁLCULO</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>Las tarifas se calculan mediante un algoritmo basado en distancia, tiempo estimado y demanda. El precio mostrado al solicitar el viaje es una estimación que puede variar por cambio de ruta o paradas adicionales.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• PAGOS</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>El usuario podrá pagar en efectivo o mediante los métodos electrónicos integrados en la app (Transferencia, etc.).</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• CANCELACIONES</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>MOVi se reserva el derecho de aplicar una tasa de cancelación si el pasajero desiste del viaje después de que el conductor haya aceptado y se encuentre en camino.</p>
            </div>
          </div>

          {/* 5 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>5. MODELO DE NEGOCIO Y COMISIÓN</h2>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              MOVi percibe una remuneración por el uso de su infraestructura tecnológica y la gestión de intermediación.
            </p>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• COMISIÓN POR INTERMEDIACIÓN</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>Por cada viaje realizado con éxito a través de la plataforma, MOVi cobrará una comisión al conductor sobre el valor total de la tarifa cobrada al pasajero.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• TASA DE SERVICIO</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>MOVi se reserva el derecho de aplicar una "TASA DE SERVICIO" adicional a los pasajeros en cada trayecto, la cual será informada de manera transparente al momento de solicitar el viaje.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• RETENCIONES</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>En los pagos electrónicos, MOVi retendrá automáticamente la comisión correspondiente antes de liquidar el saldo a favor del conductor. En los pagos en efectivo, la comisión se debitará del saldo virtual que el conductor mantenga en su cuenta de la plataforma.</p>
            </div>
          </div>

          {/* 6 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>6. RELACIÓN CON LOS CONDUCTORES</h2>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              Los conductores son contratistas independientes que utilizan la plataforma bajo su propio riesgo. No existe relación de dependencia laboral entre MOVi y los conductores. Cada conductor es responsable de contar con:
            </p>
            <ol style={{ marginLeft: '24px', marginTop: '12px', color: '#000000', fontSize: '16px' }}>
              <li style={{ marginTop: '8px', marginBottom: '4px' }}>Registro de conducir vigente.</li>
              <li style={{ marginTop: '8px', marginBottom: '4px' }}>Habilitación vehicular municipal.</li>
              <li style={{ marginTop: '8px', marginBottom: '4px' }}>Seguro de responsabilidad civil contra terceros.</li>
            </ol>
          </div>

          {/* 7 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>7. LIMITACIÓN DE RESPONSABILIDAD</h2>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• INCIDENTES</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>MOVi no será responsable por daños, perjuicios, robos o accidentes que ocurren durante el trayecto. La responsabilidad civil y penal recae sobre el conductor y/o el seguro del vehículo.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• OBJETOS PERDIDOS</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>La plataforma no garantiza la recuperación de objetos olvidados en los vehículos, aunque facilitará la comunicación con el conductor para intentar su devolución.</p>
            </div>
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <p style={{ fontWeight: 'bold', color: '#000000', margin: '0 0 4px 0', fontSize: '16px' }}>• FALLAS TÉCNICAS</p>
              <p style={{ color: '#000000', fontSize: '16px', marginLeft: '24px', lineHeight: '1.5' }}>MOVi no garantiza que el servicio sea ininterrumpido o libre de errores debido a factores externos como la señal GPS o internet.</p>
            </div>
          </div>

          {/* 8 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>8. POLÍTICA DE PRIVACIDAD Y DATOS</h2>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              El usuario autoriza a MOVi a recopilar y utilizar sus datos de geolocalización en tiempo real para la correcta ejecución del servicio, así como para fines de seguridad y mejora del sistema, de acuerdo con las normativas de protección de datos personales.
            </p>
          </div>

          {/* 9 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>9. PROPIEDAD INTELECTUAL</h2>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              Todo el contenido de la plataforma (logos, código fuente, diseño, algoritmos) es propiedad de MOVi y está protegido por las leyes de propiedad intelectual. Queda prohibida su reproducción o ingeniería inversa.
            </p>
          </div>

          {/* 10 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>10. MODIFICACIONES</h2>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              MOVi podrá modificar estos Términos en cualquier momento. Las modificaciones entrarán en vigor tras la publicación de los Términos actualizados en la app. El uso continuado del servicio constituye la aceptación de los nuevos términos.
            </p>
          </div>

          {/* 11 */}
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: '0 0 12px 0' }}>11. LEY APLICABLE Y JURISDICCIÓN</h2>
            <p style={{ color: '#000000', lineHeight: '1.6', fontSize: '16px', marginBottom: '12px' }}>
              Estos Términos se rigen por las leyes de la <strong>REPÚBLICA DEL PARAGUAY</strong>. Para cualquier controversia, las partes se someten a la jurisdicción de los tribunales de la ciudad de <strong>Asunción</strong>.
            </p>
          </div>

          {/* FOOTER */}
          <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #cccccc', textAlign: 'center', fontSize: '14px', color: '#666666' }}>
            Última actualización: Abril 2026 | MOVi Technology E.A.S
          </div>

        </div>
      </div>
    </div>
  );
}
