<?xml version="1.0" encoding="UTF-8"?>
<sml:SensorML xmlns:sml="http://www.opengis.net/sensorML/1.0.1" xmlns:swe="http://www.opengis.net/swe/1.0.1" xmlns:gml="http://www.opengis.net/gml" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0.1">
  <sml:member>
    <sml:System>
      <!-- ======================================= -->
      <!--               Identifiers               -->
      <!-- ======================================= -->
      <sml:identification>
        <sml:IdentifierList>
          <sml:identifier name="uniqueID">
            <sml:Term definition="urn:ogc:def:identifier:OGC:1.0:uniqueID">
              <sml:value>http://shom.fr/maregraphie/procedure/34</sml:value>
            </sml:Term>
          </sml:identifier>
          <sml:identifier name="id_shom">
            <sml:Term definition="http://">
              <sml:value>34</sml:value>
            </sml:Term>
          </sml:identifier>
          <sml:identifier name="longName">
            <sml:Term definition="urn:ogc:def:identifier:OGC:1.0:longName">
              <sml:value>LA_ROCHELLE-PALLICE</sml:value>
            </sml:Term>
          </sml:identifier>
        </sml:IdentifierList>
      </sml:identification>
      <!-- ======================================= -->
      <!--               Classifiers               -->
      <!-- ======================================= -->
      <sml:classification>
        <sml:ClassifierList>
          <sml:classifier name="value">
            <sml:Term definition="http://shom.fr/maregraphie/id_shom">
              <sml:value>34</sml:value>
            </sml:Term>
          </sml:classifier>
          <sml:classifier name="label">
            <sml:Term definition="http://shom.fr/maregraphie/label">
              <sml:value>LA_ROCHELLE-PALLICE</sml:value>
            </sml:Term>
          </sml:classifier>
        </sml:ClassifierList>
      </sml:classification>
      <!-- ======================================= -->
      <!--            Constraints              -->
      <!-- =======================================  -->
      <sml:validTime>
        <gml:TimePeriod gml:id="documentValidTime">
          <gml:beginPosition>2050-01-01</gml:beginPosition>
          <gml:endPosition indeterminatePosition="now"/>
        </gml:TimePeriod>
      </sml:validTime>
      <sml:legalConstraint>
        <sml:Rights>
          <sml:documentation>
            <sml:Document>
              <gml:description>Voir les conditions générales d'utilisation sur l'espace de diffusion.</gml:description>
            </sml:Document>
          </sml:documentation>
        </sml:Rights>
      </sml:legalConstraint>
      <!-- ======================================= -->
      <!--            Characteristics              -->
      <!--            in capapabilities...         -->
      <!-- =======================================  -->
      <sml:capabilities name="characterics">
        <swe:DataRecord>
          <swe:field name="ville_d_hebergement">
            <swe:Text definition="http://shom.fr/maregraphie/ville_d_hebergement">
              <swe:value>La Rochelle</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="fuseau_horaire">
            <swe:Text definition="http://shom.fr/maregraphie/fuseau_horaire">
              <swe:value>0</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="longitude">
            <swe:Quantity definition="http://shom.fr/maregraphie/longitude">
              <swe:value>-1.2206499576568604</swe:value>
            </swe:Quantity>
          </swe:field>
          <swe:field name="latitude">
            <swe:Quantity definition="http://shom.fr/maregraphie/latitude">
              <swe:value>46.15850067138672</swe:value>
            </swe:Quantity>
          </swe:field>
          <swe:field name="sect_geographique">
            <swe:Text definition="http://shom.fr/maregraphie/sect_geographique">
              <swe:value>FH</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="date_prem_obs">
            <swe:Category definition="http://shom.fr/maregraphie/date_prem_obs">
              <swe:value>1941-05-18</swe:value>
            </swe:Category>
          </swe:field>
          <swe:field name="descriptif_capteur">
            <swe:Text definition="http://shom.fr/maregraphie/descriptif_capteur">
              <swe:value>https://www.vega.com/fr-fr/produits/catalogue-produits/mesure-de-niveau/radar/vegapuls-c-23</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="collocalisation">
            <swe:Text definition="http://shom.fr/maregraphie/collocalisation">
              <swe:value>https://www.sonel.org/spip.php?page=gps&amp;idStation=934</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="etat_maregraphe">
            <swe:Text definition="http://shom.fr/maregraphie/etat_maregraphe">
              <swe:value>OK</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="info_maregraphe">
            <swe:Text definition="http://shom.fr/maregraphie/info_maregraphe">
              <swe:value>https://refmar.shom.fr/donnees/34</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="journal_de_bord">
            <swe:Text definition="http://shom.fr/maregraphie/journal_de_bord">
              <swe:value>https://refmar.shom.fr/donnees/34</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="spm">
            <swe:Text definition="http://shom.fr/maregraphie/spm">
              <swe:value>LA_ROCHELLE-PALLICE</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="zero_hydro">
            <swe:Text definition="http://shom.fr/maregraphie/zero_hydro">
              <swe:value>zero_hydrographique</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="reseau">
            <swe:Text definition="http://shom.fr/maregraphie/reseau">
              <swe:value>RONIM</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="id_ram">
            <swe:Text definition="http://shom.fr/maregraphie/id_ram">
              <swe:value>La Rochelle - La Pallice</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="link_ram">
            <swe:Text definition="http://shom.fr/maregraphie/link_ram">
              <swe:value>https://diffusion.shom.fr/donnees/references-verticales/references-altimetriques-maritimes-ram.html</swe:value>
            </swe:Text>
          </swe:field>
          <swe:field name="gestionnaire">
            <swe:Text definition="http://shom.fr/maregraphie/gestionnaire">
              <swe:value>Shom</swe:value>
            </swe:Text>
          </swe:field>
        </swe:DataRecord>
      </sml:capabilities>
      <!-- ================================= -->
      <!--            Capabilities           -->
      <!-- ================================= -->
      <sml:capabilities name="offerings">
        <swe:SimpleDataRecord>
          <swe:field name="Offering_for_sensor">
            <swe:Text definition="urn:ogc:def:identifier:OGC:offeringID">
              <swe:value>http://shom.fr/maregraphie/offering/34</swe:value>
            </swe:Text>
          </swe:field>
        </swe:SimpleDataRecord>
      </sml:capabilities>
      <sml:capabilities name="featuresOfInterest">
        <swe:SimpleDataRecord>
          <swe:field name="featureOfInterestID">
            <swe:Text>
              <swe:value>http://shom.fr/maregraphie/featureOfInterest/34</swe:value>
            </swe:Text>
          </swe:field>
        </swe:SimpleDataRecord>
      </sml:capabilities>
      <sml:capabilities name="organisme">
        <swe:DataRecord definition="http://shom.fr/maregraphie/organisme">
          
          <swe:field name="Shom">
            <swe:DataRecord definition="http://shom.fr/maregraphie/organisme">
              <swe:field name="nom">
                <swe:Text definition="http://shom.fr/maregraphie/nom_organisme">
                  <swe:value>Shom</swe:value>
                </swe:Text>
              </swe:field>
              <swe:field name="logo">
                <swe:Text definition="http://shom.fr/maregraphie/logo">
                  <swe:value>https://services.data.shom.fr/static/logo/DDM/logo_SHOM.png</swe:value>
                </swe:Text>
              </swe:field>
              <swe:field name="URL">
                <swe:Text definition="http://shom.fr/maregraphie/lien">
                  <swe:value>https://www.shom.fr</swe:value>
                </swe:Text>
              </swe:field>
            </swe:DataRecord>
          </swe:field>
          <swe:field name="GPM La Rochelle">
            <swe:DataRecord definition="http://shom.fr/maregraphie/organisme">
              <swe:field name="nom">
                <swe:Text definition="http://shom.fr/maregraphie/nom_organisme">
                  <swe:value>GPM La Rochelle</swe:value>
                </swe:Text>
              </swe:field>
              <swe:field name="logo">
                <swe:Text definition="http://shom.fr/maregraphie/logo">
                  <swe:value>https://services.data.shom.fr/static/logo/DDM/logo_GPM_La_Rochelle.png</swe:value>
                </swe:Text>
              </swe:field>
              <swe:field name="URL">
                <swe:Text definition="http://shom.fr/maregraphie/lien">
                  <swe:value>https://www.larochelle.port.fr/</swe:value>
                </swe:Text>
              </swe:field>
            </swe:DataRecord>
          </swe:field>
          
        </swe:DataRecord>
      </sml:capabilities>
      <!-- ============================ -->
      <!--           Contacts           -->
      <!-- ============================ -->
      
      <sml:contact>
        <sml:ContactList>
          <sml:member>
            <sml:ResponsibleParty>
              <sml:individualName>SHOM</sml:individualName>
              <sml:organizationName>SHOM</sml:organizationName>
              <sml:contactInfo>
                <sml:phone>
                  <sml:voice>02 56 31 24 26</sml:voice>
                </sml:phone>
                <sml:address>
                  <sml:deliveryPoint>13 rue du chatellier</sml:deliveryPoint>
                  <sml:city>BREST</sml:city>
                  <sml:postalCode>29200</sml:postalCode>
                  <sml:country>France</sml:country>
                  <sml:electronicMailAddress>refmar@shom.fr</sml:electronicMailAddress>
                </sml:address>
                <sml:onlineResource xlink:href="http://shom.fr/maregraphie"/>
              </sml:contactInfo>
            </sml:ResponsibleParty>
          </sml:member>
        </sml:ContactList>
      </sml:contact>
      
      <!-- ============================ -->
      <!--         Documentation        -->
      <!-- ============================ -->
      <!-- ============================ -->
      <!--            Position          -->
      <!-- ============================ -->
      <sml:position name="sensorPosition">
        <swe:Position fixed="true" referenceFrame="urn:ogc:def:crs:EPSG::4326">
          <swe:location>
            <swe:Vector gml:id="STATION_LOCATION">
              <swe:coordinate name="latitude">
                <swe:Quantity axisID="x">
                  <swe:uom code="degree"/>
                  <swe:value>46.15850067138672</swe:value>
                </swe:Quantity>
              </swe:coordinate>
              <swe:coordinate name="longitude">
                <swe:Quantity axisID="y">
                  <swe:uom code="degree"/>
                  <swe:value>-1.2206499576568604</swe:value>
                </swe:Quantity>
              </swe:coordinate>
            </swe:Vector>
          </swe:location>
        </swe:Position>
      </sml:position>
      <!-- =============================== -->
      <!--              Inputs             -->
      <!-- =============================== -->
      <sml:inputs>
        <sml:InputList>
          <sml:input name="observedProperty_WaterHeight">
            <swe:ObservableProperty definition="http://shom.fr/maregraphie/observedProperty/WaterHeight"/>
          </sml:input>
        </sml:InputList>
      </sml:inputs>
      <!-- =============================== -->
      <!--              Outputs            -->
      <!-- =============================== -->
      <sml:outputs>
        <sml:OutputList>
          <sml:output name="observedProperty_WaterHeight_1">
            <swe:Count definition="http://shom.fr/maregraphie/observedProperty/WaterHeight/1"/>
          </sml:output>
          <sml:output name="observedProperty_WaterHeight_2">
            <swe:Count definition="http://shom.fr/maregraphie/observedProperty/WaterHeight/2"/>
          </sml:output>
          <sml:output name="observedProperty_WaterHeight_3">
            <swe:Count definition="http://shom.fr/maregraphie/observedProperty/WaterHeight/3"/>
          </sml:output>
          <sml:output name="observedProperty_WaterHeight_4">
            <swe:Count definition="http://shom.fr/maregraphie/observedProperty/WaterHeight/4"/>
          </sml:output>
          <sml:output name="observedProperty_WaterHeight_5">
            <swe:Count definition="http://shom.fr/maregraphie/observedProperty/WaterHeight/5"/>
          </sml:output>
          <sml:output name="observedProperty_WaterHeight_6">
            <swe:Count definition="http://shom.fr/maregraphie/observedProperty/WaterHeight/6"/>
          </sml:output>
        </sml:OutputList>
      </sml:outputs>
      <!-- =============================== -->
      <!--              History            -->
      <!-- =============================== -->
      <sml:history xlink:title="observatory_logbook_events">
        <sml:EventList>
          <sml:member name="logbook-2011-01-14">
            <sml:Event>
              <sml:date>2011-07-05T13:44:01.000Z</sml:date>
              <gml:description>
	Les données validées jusqu&apos;au 10/01/2011 sont disponibles sur le serveur FTP
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2005-04-19">
            <sml:Event>
              <sml:date>2011-07-26T09:15:05.000Z</sml:date>
              <gml:description>
	Le 19 avril 2005, deux techniciens du SHOM se sont rendus sur le site MCN de la Pallice pour la mise en place de deux batteries à plomb externes. Ils y ont également réalisé quelques mesures de contrôle à l&apos;aide d&apos;une sonde lumineuse.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2013-11-06">
            <sml:Event>
              <sml:date>2013-11-07T09:03:05.000Z</sml:date>
              <gml:description>
	
		Controle à la sonde lumineuse effectué ce jour.
	
		Résultats:
	
		- Moyenne des écarts à BM : 0.47 cm (écart type : 0.57 cm)
	
		- Moyenne des écarts à PM : -1.21 cm (écart type : 0.31 cm)

</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2013-10-16">
            <sml:Event>
              <sml:date>2013-10-16T09:30:04.000Z</sml:date>
              <gml:description>
	Changement de la côte du d (modification de 3 mm) du MCN suite au nouveau nivellement.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2013-03-22">
            <sml:Event>
              <sml:date>2013-04-02T07:42:01.000Z</sml:date>
              <gml:description>
	Données temps réel de nouveau disponibles
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2013-01-25">
            <sml:Event>
              <sml:date>2013-01-28T09:08:04.000Z</sml:date>
              <gml:description>
	Problème de liaison avec le temps réel. Pas de donnée en temps réel disponible pour le moment.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2012-02-22">
            <sml:Event>
              <sml:date>2012-02-27T16:02:04.000Z</sml:date>
              <gml:description>
	Contrôle à la sonde lumineuse du MCN.

	 

	Résultat : Bon

	Ecarts entre la sonde et le MCN :

	0.53 cm (écart type 0.29) à BM

	-0.46 cm (écart type 0.12) à PM.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2013-04-10">
            <sml:Event>
              <sml:date>2013-04-11T13:22:04.000Z</sml:date>
              <gml:description>
	Contrôle à la sonde lumineuse effectué ce jour.

	Résultats :

	Moyenne des écarts à BM : -0.27cm (écart type : 0.12 cm)

	Moyenne des écarts à PM : -1.16cm (écart type : 0.5 cm)</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2009-01-23">
            <sml:Event>
              <sml:date>2011-07-26T07:16:00.000Z</sml:date>
              <gml:description>
	Du 19 au 22 janvier 2009, deux techniciens du SHOM se sont rendus sur place pour procéder à l&apos;installation d&apos;un MCN nouvelle génération, composé d&apos;un capteur Optiflex et d&apos;une centrale d&apos;acquisition Marelta.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2012-11-08">
            <sml:Event>
              <sml:date>2012-11-08T16:00:00.000Z</sml:date>
              <gml:description>
	Suite à un problème technique, les données brutes fournies par le marégraphe de La Rochelle - La Pallice ne sont pas disponibles entre 03h00 et 15h30 (TU).

	Néanmoins, les données ont été enregistrées. Dès que possible, elles seront mises en ligne comme données validées (à pas de temps de 10 minutes et horaire). 
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2012-01-17">
            <sml:Event>
              <sml:date>2012-02-27T14:06:05.000Z</sml:date>
              <gml:description>
	Lors de l&apos;archivage des données suite à la relance du MCN, les valeurs du 27/10 au 28/10 ont été supprimées (problème avec le tube, données aberrantes).</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2011-11-22">
            <sml:Event>
              <sml:date>2011-12-12T14:51:01.000Z</sml:date>
              <gml:description>
	Le tube de tranquillisation a été réparé ce jour.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2011-10-27">
            <sml:Event>
              <sml:date>2011-10-28T07:21:00.000Z</sml:date>
              <gml:description>
	Problème au niveau du tube de tranquillisation. Ce dernier a été cassé, les mesures sont donc perturbées.

	Les partenaires sont prévenus, nous attendons leur intervention pour la réparation du tube.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2011-07-05">
            <sml:Event>
              <sml:date>2011-07-05T13:39:02.000Z</sml:date>
              <gml:description>
	Les données validées jusqu&apos;au 30 mai 2011 sont disponibles sur le serveur FTP.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2012-10-17">
            <sml:Event>
              <sml:date>2012-10-19T14:06:03.000Z</sml:date>
              <gml:description>
	Contrôle à la sonde lumineuse effectué ce jour.

	Résultats :

	Moyenne des écarts à BM : -0.21 cm (écart type : 0.37)

	Moyenne des écarts à PM : -0.77 cm (écart type : 0.15)
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-1997-04-28">
            <sml:Event>
              <sml:date>2011-07-05T13:40:03.000Z</sml:date>
              <gml:description>
	Installation du 1er marégraphe MCN à La Pallice: capteur ultrason et centrale MORS HT200.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2014-10-06">
            <sml:Event>
              <sml:date>2014-10-06T12:06:05.000Z</sml:date>
              <gml:description>
	Mise à jour des Données à 10 minutes validées en temps différé (idsource=3) pour l&apos;ensemble des mesures.

	
		Mise à jour des Données horaires validées en temps différé (idsource=4) pour l&apos;ensemble des mesures.

</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2001-04-23">
            <sml:Event>
              <sml:date>2011-07-05T13:40:05.000Z</sml:date>
              <gml:description>
	Mise en place d&apos;un capteur radar Krohne BM70 et d&apos;une nouvelle centrale MORS HT200.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2003-01-20">
            <sml:Event>
              <sml:date>2011-07-05T13:41:01.000Z</sml:date>
              <gml:description>
	Changement de la valeur du paramètre D: de -594 à -593, suite à un enfoncement du caisson.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2014-10-06">
            <sml:Event>
              <sml:date>2015-02-05T14:56:05.000Z</sml:date>
              <gml:description>
	Controle à la sonde lumineuse effectué ce jour :

	Moyenne des écarts à BM : 1.07 cm (écart type : 0.5 cm).
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2004-07-18">
            <sml:Event>
              <sml:date>2011-07-05T13:41:02.000Z</sml:date>
              <gml:description>
	Choc sur le caisson du marégraphe. Nouvelle valeur du paramètre D: -591.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2004-11-04">
            <sml:Event>
              <sml:date>2011-07-05T13:41:04.000Z</sml:date>
              <gml:description>
	Intervention sur le caisson du capteur, redressement de la plaque. Nouvelle valeur de D: -593.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2008-07-02">
            <sml:Event>
              <sml:date>2011-07-05T13:42:00.000Z</sml:date>
              <gml:description>
	Problème au marégraphe: Suite à une intervention du Port Autonome sur le capteur, le marégraphe n&apos;est plus opérationnel et délivre une hauteur constante de 908cm.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2008-09-30">
            <sml:Event>
              <sml:date>2011-07-05T13:42:02.000Z</sml:date>
              <gml:description>
	Installation d&apos;un nouveau marégraphe de type radar (Krohne Optiflex) avec une centrale d&apos;acquisition Marelta.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2009-01-20">
            <sml:Event>
              <sml:date>2011-07-05T13:42:05.000Z</sml:date>
              <gml:description>
	Changement d&apos;emplacement de la centrale - Suite à des travaux prévus, la centrale a été changée de place ce qui a entraîné un trou dans les mesures du 19/01/2009 16h30 au 20/01/2009 11h10 (inclus).
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2013-05-23">
            <sml:Event>
              <sml:date>2013-05-29T12:36:04.000Z</sml:date>
              <gml:description>
	Controle à la sonde lumineuse effectué ce jour.

	Moyenne des écarts à BM : 0.69 cm (écart type : 0.12 cm)
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2009-11-26">
            <sml:Event>
              <sml:date>2011-07-05T13:43:01.000Z</sml:date>
              <gml:description>
	Relance du MCN.
	Archivage des données à 10 min et HH.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2010-02-19">
            <sml:Event>
              <sml:date>2011-07-05T13:43:03.000Z</sml:date>
              <gml:description>
	Relance du MCN. Archivage des données.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2010-09-01">
            <sml:Event>
              <sml:date>2011-07-05T13:43:05.000Z</sml:date>
              <gml:description>
	Relance du MCN. Archivage des données.
</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2018-06-20">
            <sml:Event>
              <sml:date>2018-06-20T14:56:07.000Z</sml:date>
              <gml:description>Lors du dernier contrôle effectué le 17 mai 2018, il a été constaté un problème de calibration du capteur ou un problème sur le capteur. Une investigation est en cours. Les données du marégraphe  à marée basse sont douteuses.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2018-07-10">
            <sml:Event>
              <sml:date>2018-07-10T09:46:48.000Z</sml:date>
              <gml:description>Le puits du marégraphe a été nettoyé par notre partenaire. Les données semblent être de nouveau correctes. </gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2018-09-19">
            <sml:Event>
              <sml:date>2018-09-19T13:58:35.000Z</sml:date>
              <gml:description>Problème sur le capteur du MCN, les données sont douteuses, notamment à marée basse depuis mi-juin 2018.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2018-11-23">
            <sml:Event>
              <sml:date>2018-11-23T10:12:34.000Z</sml:date>
              <gml:description>Le problème semble avoir été identifié. Les données de MCN sont à nouveau correctes.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2018-11-26">
            <sml:Event>
              <sml:date>2018-11-26T18:35:58.000Z</sml:date>
              <gml:description>Erreur de transmission de données temps réel : données accessibles en différé entre le 26/11 et le 27/11</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2019-02-21">
            <sml:Event>
              <sml:date>2019-02-21T10:44:59.000Z</sml:date>
              <gml:description>Erreur serveur Shom entre le 20/02/19 et le 21/02/19 : les données 1 minute n&apos;ont pas été reçues </gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2019-06-27">
            <sml:Event>
              <sml:date>2019-06-27T09:56:29.000Z</sml:date>
              <gml:description>Données temps réelles manquantes entre 26/06/2019 et 27/06/2019 suite à une panne réseau</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2020-01-03">
            <sml:Event>
              <sml:date>2020-01-06T15:33:47.000Z</sml:date>
              <gml:description>Reprise de la liaison temps réelle filaire le 03/01/2020 à 15h</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2019-11-29">
            <sml:Event>
              <sml:date>2019-12-12T17:48:08.000Z</sml:date>
              <gml:description>Suite a un problème de transmission de données temps-réel par réseau ADSL la transmission a été temporairement basculée sur le satellite. Avec cette liaison le signal est parfois bruité et des valeurs aberrantes peuvent apparaitre</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2021-10-12">
            <sml:Event>
              <sml:date>2021-10-12T09:13:52.000Z</sml:date>
              <gml:description>Liaison filaire temps réel à nouveau opérationnelle.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2021-10-21">
            <sml:Event>
              <sml:date>2021-10-21T10:12:15.000Z</sml:date>
              <gml:description>Travaux d&apos;entretien du marégraphe ce jour.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2022-02-02">
            <sml:Event>
              <sml:date>2022-02-02T10:40:52.000Z</sml:date>
              <gml:description>Travaux de maintenance du 1er au 04/02/2022.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2022-02-03">
            <sml:Event>
              <sml:date>2022-03-18T14:44:52.000Z</sml:date>
              <gml:description>A partir de ce jour 00h00, l&apos;observatoire a subi une modification importante. Nous sommes passés d&apos;un capteur Krohne Optiflex 1300C avec puits de tranquillisation à un capteur Krohne Optiwave 7300C sur potence.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2023-10-17">
            <sml:Event>
              <sml:date>2023-10-23T10:33:53.000Z</sml:date>
              <gml:description>Depuis le 17 octobre, le marégraphe de La Rochelle - La Pallice présente des dysfonctionnements. Une équipe du Shom se rendra prochainement sur place.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2023-11-14">
            <sml:Event>
              <sml:date>2023-11-14T10:45:23.000Z</sml:date>
              <gml:description>Bien que l&apos;&apos;intervention ait eu lieu ce jour une calibration devra être effectuée.
En attente d&apos;&apos;un prochain déploiement.</gml:description>
            </sml:Event>
          </sml:member>
          <sml:member name="logbook-2024-03-11">
            <sml:Event>
              <sml:date>2024-07-10T10:36:56.000Z</sml:date>
              <gml:description>Remplacement par le Shom du capteur de niveau Optiwave 7300 par un Vega C23, sur potence.</gml:description>
            </sml:Event>
          </sml:member>

        </sml:EventList>
      </sml:history>
    </sml:System>
  </sml:member>
</sml:SensorML>
